-- =============================================================
-- 0034_promote_subscription_to_wedge.sql
--
-- Promotes customer.subscription.created / operationalize_subscription
-- from deferred to formally supported in the billing wedge:
--
-- 1. v_stripe_first_wedge_integrity_summary rebuilt to include
--    operationalize_subscription in obligation counts and
--    stripe.customer.subscription.created in event coverage.
--
-- 2. api.open_subscription_obligation updated to set title and why
--    in the obligation metadata so the command/billing pages render
--    meaningful labels without falling back to view-computed text.
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. Rebuild v_stripe_first_wedge_integrity_summary
--    Add operationalize_subscription to wedge_obligations and
--    wedge_actions; add stripe.customer.subscription.created to
--    wedge_events.
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW core.v_stripe_first_wedge_integrity_summary AS
WITH wedge_obligations AS (
  SELECT
    o.workspace_id,
    o.id,
    o.state,
    o.opened_at,
    o.resolved_at,
    o.proof_state,
    o.receipt_id
  FROM core.obligations o
  JOIN core.objects obj
    ON obj.id = o.object_id
  WHERE o.obligation_type IN (
    'record_revenue',
    'recover_payment',
    'respond_to_dispute',
    'process_refund',
    'operationalize_subscription'
  )
    AND coalesce(
      nullif(o.metadata ->> 'face', ''),
      nullif(obj.metadata ->> 'face', ''),
      CASE
        WHEN coalesce(
          nullif(o.metadata ->> 'surface', ''),
          nullif(obj.metadata ->> 'surface', '')
        ) = 'stripe_webhook'
          OR coalesce(
            nullif(o.metadata ->> 'stripe_type', ''),
            nullif(obj.metadata ->> 'stripe_type', '')
          ) IS NOT NULL
        THEN 'billing'
        ELSE NULL
      END,
      'unknown'
    ) = 'billing'
),
wedge_actions AS (
  SELECT
    workspace_id,
    obligation_id,
    is_overdue
  FROM core.v_operator_next_actions
  WHERE face = 'billing'
    AND kind IN (
      'record_revenue',
      'recover_payment',
      'respond_to_dispute',
      'process_refund',
      'operationalize_subscription'
    )
),
wedge_receipts AS (
  SELECT
    r.workspace_id,
    r.obligation_id,
    r.created_at
  FROM core.v_recent_receipts r
  JOIN wedge_obligations o
    ON o.id::text = r.obligation_id
  WHERE r.face = 'billing'
),
wedge_events AS (
  SELECT
    workspace_id,
    stripe_event_id
  FROM ingest.stripe_events
  WHERE stripe_type IN (
    'stripe.invoice.paid',
    'stripe.invoice.payment_failed',
    'stripe.charge.dispute.created',
    'stripe.charge.refunded',
    'stripe.customer.subscription.created'
  )
),
workspace_set AS (
  SELECT DISTINCT workspace_id FROM wedge_obligations
  UNION
  SELECT DISTINCT workspace_id FROM wedge_receipts
  UNION
  SELECT DISTINCT workspace_id FROM wedge_events
),
obligation_totals AS (
  SELECT
    workspace_id,
    count(*) AS total_obligations,
    count(*) FILTER (WHERE state = 'resolved') AS sealed_obligations,
    count(*) FILTER (WHERE state != 'resolved') AS open_obligations,
    avg(extract(epoch FROM (resolved_at - opened_at)) / 3600)
      FILTER (WHERE state = 'resolved' AND resolved_at IS NOT NULL) AS avg_closure_hours,
    count(*) FILTER (
      WHERE state = 'resolved'
        AND (
          receipt_id IS NULL
          OR coalesce(proof_state, 'pending') != 'linked'
        )
    ) AS proof_lag
  FROM wedge_obligations
  GROUP BY workspace_id
),
overdue_totals AS (
  SELECT
    workspace_id,
    count(*) FILTER (WHERE is_overdue) AS overdue_obligations
  FROM wedge_actions
  GROUP BY workspace_id
),
receipt_totals AS (
  SELECT
    workspace_id,
    count(DISTINCT obligation_id) AS receipted_obligations,
    count(*) FILTER (WHERE created_at >= now() - INTERVAL '7 days') AS resolved_7d,
    count(*) FILTER (WHERE created_at >= now() - INTERVAL '30 days') AS resolved_30d
  FROM wedge_receipts
  GROUP BY workspace_id
),
stripe_totals AS (
  SELECT
    workspace_id,
    count(*) AS stripe_events
  FROM wedge_events
  GROUP BY workspace_id
),
joined AS (
  SELECT
    w.workspace_id,
    coalesce(o.total_obligations, 0) AS total_obligations,
    coalesce(o.sealed_obligations, 0) AS sealed_obligations,
    coalesce(o.open_obligations, 0) AS open_obligations,
    coalesce(d.overdue_obligations, 0) AS overdue_obligations,
    coalesce(r.receipted_obligations, 0) AS receipted_obligations,
    coalesce(r.resolved_7d, 0) AS resolved_7d,
    coalesce(r.resolved_30d, 0) AS resolved_30d,
    coalesce(s.stripe_events, 0) AS stripe_events,
    coalesce(o.proof_lag, 0) AS proof_lag,
    o.avg_closure_hours
  FROM workspace_set w
  LEFT JOIN obligation_totals o ON o.workspace_id = w.workspace_id
  LEFT JOIN overdue_totals d    ON d.workspace_id = w.workspace_id
  LEFT JOIN receipt_totals r    ON r.workspace_id = w.workspace_id
  LEFT JOIN stripe_totals s     ON s.workspace_id = w.workspace_id
)
SELECT
  workspace_id,
  total_obligations,
  sealed_obligations,
  open_obligations,
  overdue_obligations,
  resolved_7d,
  resolved_30d,
  stripe_events,
  least(stripe_events, total_obligations) AS covered_events,
  CASE
    WHEN total_obligations > 0 THEN round((sealed_obligations::numeric / total_obligations::numeric) * 100)
    ELSE 100
  END::int AS closure_rate,
  CASE
    WHEN open_obligations > 0 THEN round((overdue_obligations::numeric / open_obligations::numeric) * 100)
    ELSE 0
  END::int AS breach_rate,
  CASE
    WHEN stripe_events > 0 THEN round((least(stripe_events, total_obligations)::numeric / stripe_events::numeric) * 100)
    ELSE 100
  END::int AS event_coverage,
  greatest(stripe_events - total_obligations, 0) AS events_awaiting,
  avg_closure_hours,
  CASE
    WHEN avg_closure_hours IS NULL THEN 80
    WHEN avg_closure_hours <= 0.25 THEN 100
    WHEN avg_closure_hours <= 1    THEN 95
    WHEN avg_closure_hours <= 4    THEN 88
    WHEN avg_closure_hours <= 12   THEN 72
    WHEN avg_closure_hours <= 24   THEN 52
    WHEN avg_closure_hours <= 48   THEN 32
    ELSE 15
  END::int AS latency_score,
  proof_lag,
  CASE
    WHEN sealed_obligations > 0 THEN round((1 - proof_lag::numeric / sealed_obligations::numeric) * 100)
    ELSE 100
  END::int AS proof_score,
  CASE
    WHEN total_obligations >= 20 THEN 'High'
    WHEN total_obligations >= 5  THEN 'Medium'
    ELSE 'Low'
  END::text AS confidence,
  now() AS computed_at
FROM joined;

GRANT SELECT ON core.v_stripe_first_wedge_integrity_summary TO authenticated, service_role;

COMMENT ON VIEW core.v_stripe_first_wedge_integrity_summary IS
  'Stripe first-wedge integrity summary. Counts all supported billing-wedge obligations (including operationalize_subscription), receipts, and inbound Stripe movements.';

-- ---------------------------------------------------------------
-- 2. Update api.open_subscription_obligation to set title and why
--    so v_operator_next_actions renders meaningful labels.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.open_subscription_obligation(
  p_provider_account_id    text,
  p_stripe_event_id        text,
  p_stripe_subscription_id text,
  p_stripe_customer_id     text,
  p_livemode               boolean DEFAULT false,
  p_metadata               jsonb   DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_conn            core.provider_connections%ROWTYPE;
  v_idempotency_key text;
  v_economic_ref_id uuid;
  v_object_id       uuid;
  v_obligation_id   uuid;
BEGIN
  SELECT * INTO v_conn
    FROM core.provider_connections
   WHERE provider            = 'stripe'
     AND provider_account_id = p_provider_account_id
     AND livemode            = p_livemode
     AND is_active           = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'no active stripe provider connection for account % (livemode=%)',
      p_provider_account_id, p_livemode
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_idempotency_key := 'operationalize_subscription:' || p_stripe_event_id;

  SELECT id INTO v_obligation_id
    FROM core.obligations
   WHERE workspace_id    = v_conn.workspace_id
     AND idempotency_key = v_idempotency_key;

  IF FOUND THEN
    RETURN v_obligation_id;
  END IF;

  v_economic_ref_id := api.resolve_economic_ref(
    p_workspace_id    := v_conn.workspace_id,
    p_ref_type        := 'subscription',
    p_ref_key         := p_stripe_subscription_id,
    p_external_system := 'stripe',
    p_external_id     := p_stripe_subscription_id,
    p_customer_key    := p_stripe_customer_id,
    p_metadata        := jsonb_build_object(
      'stripe_event_id',     p_stripe_event_id,
      'stripe_customer_id',  p_stripe_customer_id,
      'provider_account_id', p_provider_account_id
    ) || p_metadata
  );

  INSERT INTO core.objects (
    workspace_id, kernel_class, economic_posture,
    acknowledged_by_actor_class, acknowledged_by_actor_id,
    source_ref, metadata
  ) VALUES (
    v_conn.workspace_id, 'subscription', 'direct_revenue',
    'system', 'stripe:' || p_provider_account_id,
    p_stripe_subscription_id,
    jsonb_build_object(
      'stripe_subscription_id', p_stripe_subscription_id,
      'stripe_customer_id',     p_stripe_customer_id,
      'provider_account_id',    p_provider_account_id,
      'stripe_event_id',        p_stripe_event_id
    ) || p_metadata
  )
  ON CONFLICT (workspace_id, kernel_class, source_ref)
  DO UPDATE SET
    metadata = core.objects.metadata || excluded.metadata
  RETURNING id INTO v_object_id;

  IF v_object_id IS NULL THEN
    SELECT id INTO v_object_id
      FROM core.objects
     WHERE workspace_id = v_conn.workspace_id
       AND kernel_class = 'subscription'
       AND source_ref   = p_stripe_subscription_id;
  END IF;

  INSERT INTO core.obligations (
    workspace_id, object_id, obligation_type,
    opened_by_actor_class, opened_by_actor_id,
    idempotency_key, economic_ref_id, metadata
  ) VALUES (
    v_conn.workspace_id, v_object_id, 'operationalize_subscription',
    'system', 'stripe:' || p_provider_account_id,
    v_idempotency_key, v_economic_ref_id,
    jsonb_build_object(
      'stripe_event_id',        p_stripe_event_id,
      'stripe_subscription_id', p_stripe_subscription_id,
      'stripe_customer_id',     p_stripe_customer_id,
      'provider_account_id',    p_provider_account_id,
      'title',                  'Onboard new subscriber · ' || p_stripe_customer_id,
      'why',                    'Subscription ' || p_stripe_subscription_id || ' created — verify account setup and confirm service activation.',
      'face',                   'billing',
      'severity',               'due_today',
      'surface',                'stripe_webhook'
    ) || p_metadata
  )
  ON CONFLICT (workspace_id, idempotency_key)
  DO NOTHING
  RETURNING id INTO v_obligation_id;

  IF v_obligation_id IS NULL THEN
    SELECT id INTO v_obligation_id
      FROM core.obligations
     WHERE workspace_id    = v_conn.workspace_id
       AND idempotency_key = v_idempotency_key;
  END IF;

  RETURN v_obligation_id;
END;
$$;

REVOKE ALL ON FUNCTION api.open_subscription_obligation(
  text, text, text, text, boolean, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api.open_subscription_obligation(
  text, text, text, text, boolean, jsonb
) TO service_role;

COMMIT;
