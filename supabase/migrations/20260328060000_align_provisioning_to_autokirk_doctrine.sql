-- ============================================================
-- 20260328060000_align_provisioning_to_autokirk_doctrine.sql
-- ============================================================
-- AUTOKIRK ACCOUNT ACTIVATION — NAMING ALIGNMENT
--
-- Refactors the provisioning surface from Stripe-centric naming
-- to AutoKirk-native kernel vocabulary:
--
--   registry.stripe_customer_map → registry.billing_account_bindings
--   api.provision_customer_workspace → api.provision_account_workspace
--   api.v_customer_provisioning → api.v_workspace_provisioning
--   event: customer.provisioned → workspace.provisioned
--   api.link_operator_on_login → (unchanged, already kernel-native)
--
-- Doctrine: Stripe is a billing source. AutoKirk provisions governed
-- operational workspaces. The kernel owns the nouns.
--
-- No behavioral changes. Pure naming alignment.
-- ============================================================

BEGIN;

-- ------------------------------------
-- 1. Rename table
-- ------------------------------------
ALTER TABLE registry.stripe_customer_map
  RENAME TO billing_account_bindings;

-- Rename indexes to match
ALTER INDEX IF EXISTS idx_stripe_customer_map_cust
  RENAME TO idx_billing_account_bindings_cust;

ALTER INDEX IF EXISTS idx_stripe_customer_map_email
  RENAME TO idx_billing_account_bindings_email;

-- ------------------------------------
-- 2. Rename event type
-- ------------------------------------
UPDATE registry.event_types
   SET name = 'workspace.provisioned',
       description = 'Governed workspace activated from paid billing account'
 WHERE name = 'customer.provisioned';

-- ------------------------------------
-- 3. Rename receipt type description
-- ------------------------------------
UPDATE registry.receipt_types
   SET description = 'Governed account activation receipt — proves workspace provisioning was kernel-managed'
 WHERE name = 'provisioning';

-- ------------------------------------
-- 4. Replace provision_customer_workspace with provision_account_workspace
-- ------------------------------------

CREATE OR REPLACE FUNCTION api.provision_account_workspace(
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
  v_existing       registry.billing_account_bindings%ROWTYPE;
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
    FROM registry.billing_account_bindings
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
   WHERE name = 'workspace.provisioned';

  SELECT id INTO v_receipt_type_id
    FROM registry.receipt_types
   WHERE name = 'provisioning';

  IF v_event_type_id IS NULL OR v_receipt_type_id IS NULL THEN
    RAISE EXCEPTION 'Registry entries for workspace.provisioned / provisioning not found.';
  END IF;

  -- -------------------------------------------------------
  -- BUILD: name + slug
  -- -------------------------------------------------------
  v_display_name := COALESCE(
    NULLIF(p_customer_name, ''),
    split_part(p_email, '@', 1)
  );

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
  -- CREATE: Workspace
  -- -------------------------------------------------------
  INSERT INTO core.workspaces (tenant_id, name, slug)
  VALUES (
    v_tenant_id,
    v_display_name || ' Operations',
    v_slug || '-ops'
  )
  RETURNING id INTO v_workspace_id;

  -- -------------------------------------------------------
  -- LINK: Operator (if auth user exists for this email)
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
  -- BIND: Billing account → workspace
  -- -------------------------------------------------------
  INSERT INTO registry.billing_account_bindings (
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
    'activation:' || p_stripe_customer_id,
    p_subscription_id,
    jsonb_build_object(
      'billing_account_id', p_stripe_customer_id,
      'email',              p_email,
      'subscription_id',    p_subscription_id,
      'activated_at',       now()
    )
  )
  ON CONFLICT (workspace_id, kernel_class, source_ref)
    WHERE source_ref IS NOT NULL
  DO UPDATE SET
    metadata = core.objects.metadata || EXCLUDED.metadata
  RETURNING id INTO v_object_id;

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
  v_idempotency_key := 'activation:' || p_stripe_customer_id;

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
    'activation-pipeline',
    now() + interval '24 hours',
    jsonb_build_object(
      'billing_account_id', p_stripe_customer_id,
      'email',              p_email,
      'subscription_id',    p_subscription_id,
      'tenant_id',          v_tenant_id,
      'workspace_id',       v_workspace_id,
      'activated_at',       now(),
      'face',               'billing',
      'severity',           'due_today',
      'surface',            'activation_pipeline'
    )
  )
  RETURNING id INTO v_obligation_id;

  -- -------------------------------------------------------
  -- LEDGER EVENT: workspace.provisioned
  -- -------------------------------------------------------
  v_chain_key := 'activation:' || v_workspace_id::text;

  INSERT INTO ledger.events (
    workspace_id,
    chain_key,
    event_type_id,
    payload,
    idempotency_key,
    seq, prev_hash, hash
  ) VALUES (
    v_workspace_id,
    v_chain_key,
    v_event_type_id,
    jsonb_build_object(
      'action',              'workspace_provisioned',
      'billing_account_id',  p_stripe_customer_id,
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
  -- RECEIPT: activation proof
  -- -------------------------------------------------------
  INSERT INTO ledger.receipts (
    workspace_id,
    event_id,
    receipt_type_id,
    chain_key,
    payload,
    seq, prev_hash, hash
  ) VALUES (
    v_workspace_id,
    v_event_id,
    v_receipt_type_id,
    'obligation:' || v_obligation_id::text,
    jsonb_build_object(
      'action',              'workspace_provisioned',
      'billing_account_id',  p_stripe_customer_id,
      'email',               p_email,
      'tenant_id',           v_tenant_id,
      'workspace_id',        v_workspace_id,
      'obligation_id',       v_obligation_id
    ),
    0, 'GENESIS', 'PENDING'
  )
  RETURNING id INTO v_receipt_id;

  -- -------------------------------------------------------
  -- Link receipt to obligation
  -- -------------------------------------------------------
  UPDATE core.obligations
     SET receipt_id     = v_receipt_id,
         proof_state    = 'linked',
         proof_strength = 'kernel_receipt',
         linked_at      = now(),
         proof_note     = 'Activation receipt auto-linked'
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

COMMENT ON FUNCTION api.provision_account_workspace IS
  'Provisions a governed operational workspace from a paid billing account. '
  'Idempotent — returns existing workspace if billing account already bound. '
  'Creates: tenant → workspace → membership → object → obligation → event → receipt. '
  'Stripe is the billing trigger; AutoKirk owns the activation path.';

REVOKE ALL ON FUNCTION api.provision_account_workspace(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.provision_account_workspace(text, text, text, text) TO service_role;

-- Keep old name as a thin wrapper for backward compatibility
-- (webhook route calls provision_customer_workspace until TS is updated)
CREATE OR REPLACE FUNCTION api.provision_customer_workspace(
  p_stripe_customer_id text,
  p_email              text,
  p_subscription_id    text DEFAULT NULL,
  p_customer_name      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = api
AS $$
  SELECT api.provision_account_workspace(
    p_stripe_customer_id, p_email, p_subscription_id, p_customer_name
  );
$$;

COMMENT ON FUNCTION api.provision_customer_workspace IS
  'Backward-compatible wrapper. Delegates to api.provision_account_workspace.';

-- ------------------------------------
-- 5. Replace dashboard view
-- ------------------------------------

DROP VIEW IF EXISTS api.v_customer_provisioning;

CREATE OR REPLACE VIEW api.v_workspace_provisioning AS
SELECT
  bab.stripe_customer_id  AS billing_account_id,
  bab.email,
  bab.subscription_id,
  bab.provisioned_at      AS activated_at,
  t.name                  AS tenant_name,
  t.slug                  AS tenant_slug,
  w.name                  AS workspace_name,
  w.id                    AS workspace_id,
  (SELECT count(*) FROM core.memberships m WHERE m.workspace_id = w.id) AS member_count,
  (SELECT count(*) FROM core.obligations o WHERE o.workspace_id = w.id) AS obligation_count
FROM registry.billing_account_bindings bab
JOIN core.tenants    t ON t.id = bab.tenant_id
JOIN core.workspaces w ON w.id = bab.workspace_id
ORDER BY bab.provisioned_at DESC;

GRANT SELECT ON api.v_workspace_provisioning TO service_role, authenticated;

-- ------------------------------------
-- 6. Update RLS policies to reference new table name
-- ------------------------------------
-- Policies auto-rename with the table, but let's verify the
-- auth read policy references the correct table
DROP POLICY IF EXISTS stripe_customer_map_auth_read ON registry.billing_account_bindings;

CREATE POLICY billing_account_bindings_auth_read
  ON registry.billing_account_bindings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM core.memberships m
      WHERE m.workspace_id = registry.billing_account_bindings.workspace_id
        AND m.operator_id = core.current_operator_id()
    )
  );

-- Rename the service_role policy too for consistency
DROP POLICY IF EXISTS stripe_customer_map_service_all ON registry.billing_account_bindings;

CREATE POLICY billing_account_bindings_service_all
  ON registry.billing_account_bindings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
