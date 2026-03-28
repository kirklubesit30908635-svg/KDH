-- ============================================================
-- 20260327210000_customer_provisioning_pipeline.sql
-- ============================================================
-- CUSTOMER PROVISIONING PIPELINE
--
-- When a new customer subscribes via Stripe, automatically
-- provision: tenant → workspace → membership → object →
-- obligation → ledger event → receipt.
--
-- Full governed path — every mutation uses canonical kernel
-- append/insert patterns with hash-chained ledger proof.
--
-- KERNEL AUDIT:
--   1. Obligation: operationalize_subscription created on provisioning
--   2. Receipt: provisioning receipt via governed ledger append
--   3. Governed: All mutations via api.provision_customer_workspace
--   4. Leakage: No — every subscription provisions or returns existing
--   5. Isolation: workspace_id scoped, RLS enforced
-- ============================================================

BEGIN;

-- ------------------------------------
-- 0. Registry: provisioning event + receipt types
-- ------------------------------------

INSERT INTO registry.event_types (family, name, description)
VALUES ('provisioning', 'customer.provisioned', 'New customer workspace provisioned from Stripe subscription')
ON CONFLICT DO NOTHING;

INSERT INTO registry.receipt_types (name, description)
VALUES ('provisioning', 'Customer workspace provisioning receipt — proves workspace creation was governed')
ON CONFLICT DO NOTHING;

-- ------------------------------------
-- 1. Lookup table: Stripe customer → workspace
-- ------------------------------------

CREATE TABLE IF NOT EXISTS registry.stripe_customer_map (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id text        NOT NULL UNIQUE,
  tenant_id          uuid        NOT NULL REFERENCES core.tenants(id),
  workspace_id       uuid        NOT NULL REFERENCES core.workspaces(id),
  email              text,
  subscription_id    text,
  provisioned_at     timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE registry.stripe_customer_map IS
  'Maps Stripe customer IDs to AutoKirk tenants/workspaces. One row per paying customer.';

CREATE INDEX IF NOT EXISTS idx_stripe_customer_map_cust
  ON registry.stripe_customer_map(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_stripe_customer_map_email
  ON registry.stripe_customer_map(email);

ALTER TABLE registry.stripe_customer_map ENABLE ROW LEVEL SECURITY;

-- Service role can do everything; authenticated can read their own workspace
CREATE POLICY stripe_customer_map_service_all
  ON registry.stripe_customer_map
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY stripe_customer_map_auth_read
  ON registry.stripe_customer_map
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM core.memberships m
      WHERE m.workspace_id = registry.stripe_customer_map.workspace_id
        AND m.operator_id = core.current_operator_id()
    )
  );

GRANT SELECT ON registry.stripe_customer_map TO authenticated;
GRANT ALL    ON registry.stripe_customer_map TO service_role;

-- ------------------------------------
-- 2. Core provisioning RPC
-- ------------------------------------

CREATE OR REPLACE FUNCTION api.provision_customer_workspace(
  p_stripe_customer_id text,
  p_email              text,
  p_subscription_id    text DEFAULT NULL,
  p_customer_name      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, registry, ledger, api, public
AS $$
DECLARE
  v_existing       registry.stripe_customer_map%ROWTYPE;
  v_tenant_id      uuid;
  v_workspace_id   uuid;
  v_operator_id    uuid;
  v_membership_id  uuid;
  v_object_id      uuid;
  v_obligation_id  uuid;
  v_event_id       uuid;
  v_receipt_id     uuid;
  v_display_name   text;
  v_slug           text;
  v_event_type_id  int;
  v_receipt_type_id int;
  v_chain_key      text;
  v_idempotency_key text;
BEGIN
  -- -------------------------------------------------------
  -- GUARD: Idempotency — already provisioned? Return it.
  -- -------------------------------------------------------
  SELECT * INTO v_existing
    FROM registry.stripe_customer_map
   WHERE stripe_customer_id = p_stripe_customer_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok',           true,
      'action',       'already_provisioned',
      'tenant_id',    v_existing.tenant_id,
      'workspace_id', v_existing.workspace_id,
      'email',        v_existing.email
    );
  END IF;

  -- -------------------------------------------------------
  -- Resolve registry type IDs
  -- -------------------------------------------------------
  SELECT id INTO v_event_type_id
    FROM registry.event_types
   WHERE name = 'customer.provisioned';

  SELECT id INTO v_receipt_type_id
    FROM registry.receipt_types
   WHERE name = 'provisioning';

  IF v_event_type_id IS NULL OR v_receipt_type_id IS NULL THEN
    RAISE EXCEPTION 'Registry entries for customer.provisioned / provisioning not found. Run migration first.';
  END IF;

  -- -------------------------------------------------------
  -- BUILD: name + slug
  -- -------------------------------------------------------
  v_display_name := COALESCE(
    NULLIF(p_customer_name, ''),
    split_part(p_email, '@', 1)
  );

  -- Slug: lowercase, alphanumeric + hyphens, max 48 chars + 6 char random suffix
  v_slug := left(
    regexp_replace(lower(v_display_name), '[^a-z0-9]+', '-', 'g'),
    48
  );
  v_slug := v_slug || '-' || left(gen_random_uuid()::text, 6);

  -- -------------------------------------------------------
  -- CREATE: Tenant
  -- -------------------------------------------------------
  INSERT INTO core.tenants (name, slug)
  VALUES (v_display_name, v_slug)
  RETURNING id INTO v_tenant_id;

  -- -------------------------------------------------------
  -- CREATE: Workspace (tier NOT a column on workspaces,
  -- so we store tier in metadata or keep it simple)
  -- -------------------------------------------------------
  INSERT INTO core.workspaces (tenant_id, name, slug)
  VALUES (
    v_tenant_id,
    v_display_name || ' Operations',
    v_slug || '-ops'
  )
  RETURNING id INTO v_workspace_id;

  -- -------------------------------------------------------
  -- CREATE: Operator link (if auth user exists for this email)
  -- -------------------------------------------------------
  SELECT o.id INTO v_operator_id
    FROM core.operators o
    JOIN auth.users u ON u.id = o.auth_uid
   WHERE u.email = p_email
   LIMIT 1;

  IF v_operator_id IS NOT NULL THEN
    INSERT INTO core.memberships (operator_id, workspace_id, role)
    VALUES (v_operator_id, v_workspace_id, 'owner')
    ON CONFLICT (operator_id, workspace_id) DO NOTHING
    RETURNING id INTO v_membership_id;
  END IF;

  -- -------------------------------------------------------
  -- REGISTER: Stripe → workspace mapping
  -- -------------------------------------------------------
  INSERT INTO registry.stripe_customer_map (
    stripe_customer_id, tenant_id, workspace_id,
    email, subscription_id
  )
  VALUES (
    p_stripe_customer_id, v_tenant_id, v_workspace_id,
    p_email, p_subscription_id
  );

  -- -------------------------------------------------------
  -- KERNEL OBJECT: subscription anchor
  -- -------------------------------------------------------
  INSERT INTO core.objects (
    workspace_id, kernel_class, economic_posture,
    acknowledged_by_actor_class, acknowledged_by_actor_id,
    source_ref, metadata
  ) VALUES (
    v_workspace_id,
    'subscription',
    'direct_revenue',
    'system',
    'provisioning:' || p_stripe_customer_id,
    p_subscription_id,
    jsonb_build_object(
      'stripe_customer_id', p_stripe_customer_id,
      'email',              p_email,
      'subscription_id',    p_subscription_id,
      'provisioned_at',     now()
    )
  )
  ON CONFLICT (workspace_id, kernel_class, source_ref)
    WHERE source_ref IS NOT NULL
  DO UPDATE SET
    metadata = core.objects.metadata || EXCLUDED.metadata
  RETURNING id INTO v_object_id;

  -- Belt-and-suspenders: if ON CONFLICT hit, get the id
  IF v_object_id IS NULL THEN
    SELECT id INTO v_object_id
      FROM core.objects
     WHERE workspace_id = v_workspace_id
       AND kernel_class = 'subscription'
       AND source_ref   = p_subscription_id;
  END IF;

  -- -------------------------------------------------------
  -- OBLIGATION: operationalize_subscription
  -- -------------------------------------------------------
  v_idempotency_key := 'provisioning:' || p_stripe_customer_id;

  INSERT INTO core.obligations (
    workspace_id,
    object_id,
    obligation_type,
    opened_by_actor_class,
    opened_by_actor_id,
    due_at,
    metadata
  ) VALUES (
    v_workspace_id,
    v_object_id,
    'operationalize_subscription',
    'system',
    'provisioning-pipeline',
    now() + interval '24 hours',
    jsonb_build_object(
      'stripe_customer_id', p_stripe_customer_id,
      'email',              p_email,
      'subscription_id',    p_subscription_id,
      'tenant_id',          v_tenant_id,
      'workspace_id',       v_workspace_id,
      'provisioned_at',     now(),
      'face',               'billing',
      'severity',           'due_today',
      'surface',            'provisioning_pipeline'
    )
  )
  RETURNING id INTO v_obligation_id;

  -- -------------------------------------------------------
  -- LEDGER EVENT: customer.provisioned
  -- Uses the canonical chain model with hash chaining.
  -- -------------------------------------------------------
  v_chain_key := 'provisioning:' || v_workspace_id::text;

  INSERT INTO ledger.events (
    workspace_id,
    chain_key,
    event_type_id,
    payload,
    idempotency_key,
    seq, prev_hash, hash  -- trigger assigns real values
  ) VALUES (
    v_workspace_id,
    v_chain_key,
    v_event_type_id,
    jsonb_build_object(
      'action',              'customer_provisioned',
      'stripe_customer_id',  p_stripe_customer_id,
      'email',               p_email,
      'subscription_id',     p_subscription_id,
      'tenant_id',           v_tenant_id,
      'workspace_id',        v_workspace_id,
      'obligation_id',       v_obligation_id
    ),
    v_idempotency_key,
    0, 'GENESIS', 'PENDING'
  )
  RETURNING id INTO v_event_id;

  -- -------------------------------------------------------
  -- RECEIPT: provisioning proof
  -- Hash-chained via ledger._receipts_before_insert trigger.
  -- -------------------------------------------------------
  INSERT INTO ledger.receipts (
    workspace_id,
    event_id,
    receipt_type_id,
    chain_key,
    payload,
    seq, prev_hash, hash  -- trigger assigns real values
  ) VALUES (
    v_workspace_id,
    v_event_id,
    v_receipt_type_id,
    'obligation:' || v_obligation_id::text,
    jsonb_build_object(
      'action',              'customer_provisioned',
      'stripe_customer_id',  p_stripe_customer_id,
      'email',               p_email,
      'tenant_id',           v_tenant_id,
      'workspace_id',        v_workspace_id,
      'obligation_id',       v_obligation_id
    ),
    0, 'GENESIS', 'PENDING'
  )
  RETURNING id INTO v_receipt_id;

  -- -------------------------------------------------------
  -- Link receipt to obligation (proof linkage from 20260318)
  -- -------------------------------------------------------
  UPDATE core.obligations
     SET receipt_id     = v_receipt_id,
         proof_state    = 'linked',
         proof_strength = 'kernel_receipt',
         linked_at      = now(),
         proof_note     = 'Provisioning receipt auto-linked'
   WHERE id = v_obligation_id;

  -- -------------------------------------------------------
  -- RETURN
  -- -------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',             true,
    'action',         'provisioned',
    'tenant_id',      v_tenant_id,
    'workspace_id',   v_workspace_id,
    'membership_id',  v_membership_id,
    'object_id',      v_object_id,
    'obligation_id',  v_obligation_id,
    'event_id',       v_event_id,
    'receipt_id',     v_receipt_id,
    'email',          p_email,
    'slug',           v_slug
  );
END;
$$;

COMMENT ON FUNCTION api.provision_customer_workspace IS
  'Provisions a new customer workspace from a Stripe subscription event. '
  'Idempotent — returns existing workspace if Stripe customer already mapped. '
  'Creates: tenant → workspace → membership → object → obligation → event → receipt.';

REVOKE ALL ON FUNCTION api.provision_customer_workspace(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.provision_customer_workspace(text, text, text, text) TO service_role;

-- ------------------------------------
-- 3. Auth callback: link operator on first login
-- ------------------------------------

CREATE OR REPLACE FUNCTION api.link_operator_on_login(
  p_auth_uid uuid,
  p_email    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, registry, public
AS $$
DECLARE
  v_operator_id  uuid;
  v_map          registry.stripe_customer_map%ROWTYPE;
  v_linked       int := 0;
BEGIN
  -- Find or create operator
  SELECT id INTO v_operator_id
    FROM core.operators
   WHERE auth_uid = p_auth_uid;

  IF v_operator_id IS NULL THEN
    INSERT INTO core.operators (auth_uid, handle)
    VALUES (
      p_auth_uid,
      left(regexp_replace(lower(split_part(p_email, '@', 1)), '[^a-z0-9_]', '_', 'g'), 28)
        || '_' || left(replace(p_auth_uid::text, '-', ''), 4)
    )
    ON CONFLICT (auth_uid) DO NOTHING
    RETURNING id INTO v_operator_id;

    -- If insert was a no-op (race condition), read it back
    IF v_operator_id IS NULL THEN
      SELECT id INTO v_operator_id
        FROM core.operators
       WHERE auth_uid = p_auth_uid;
    END IF;
  END IF;

  -- Link to any pre-provisioned workspaces matching this email
  FOR v_map IN
    SELECT * FROM registry.stripe_customer_map
     WHERE email = p_email
  LOOP
    INSERT INTO core.memberships (operator_id, workspace_id, role)
    VALUES (v_operator_id, v_map.workspace_id, 'owner')
    ON CONFLICT (operator_id, workspace_id) DO NOTHING;

    v_linked := v_linked + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',                 true,
    'operator_id',        v_operator_id,
    'workspaces_linked',  v_linked
  );
END;
$$;

COMMENT ON FUNCTION api.link_operator_on_login IS
  'Called on auth callback. Links authenticated user to any workspaces '
  'provisioned for their email via Stripe. Creates operator if needed.';

REVOKE ALL ON FUNCTION api.link_operator_on_login(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.link_operator_on_login(uuid, text) TO service_role;

-- ------------------------------------
-- 4. View: customer provisioning dashboard
-- ------------------------------------

CREATE OR REPLACE VIEW api.v_customer_provisioning AS
SELECT
  scm.stripe_customer_id,
  scm.email,
  scm.subscription_id,
  scm.provisioned_at,
  t.name   AS tenant_name,
  t.slug   AS tenant_slug,
  w.name   AS workspace_name,
  w.id     AS workspace_id,
  (SELECT count(*) FROM core.memberships m WHERE m.workspace_id = w.id) AS member_count,
  (SELECT count(*) FROM core.obligations o WHERE o.workspace_id = w.id) AS obligation_count
FROM registry.stripe_customer_map scm
JOIN core.tenants    t ON t.id = scm.tenant_id
JOIN core.workspaces w ON w.id = scm.workspace_id
ORDER BY scm.provisioned_at DESC;

GRANT SELECT ON api.v_customer_provisioning TO service_role, authenticated;

COMMIT;
