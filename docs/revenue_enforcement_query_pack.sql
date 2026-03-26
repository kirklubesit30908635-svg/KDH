-- revenue_enforcement_query_pack.sql
--
-- Read-only operating probes for the revenue-enforcement loop.
-- Use with local-postgres-ro or psql against the local Supabase database.

-- ============================================================================
-- 1) OBLIGATION PRESSURE AUDIT
-- ----------------------------------------------------------------------------
-- Answers:
-- - how many open obligations exist
-- - how many are overdue
-- - how many have no owner
-- - how many are explicitly marked blocked
-- - how many are resolved without credible proof linkage
-- ============================================================================

with open_actions as (
  select
    a.workspace_id,
    a.obligation_id,
    a.kind,
    a.face,
    a.priority,
    a.assigned_to,
    a.is_overdue,
    o.metadata
  from core.v_operator_next_actions a
  join core.obligations o
    on o.id = a.obligation_id
),
resolved_obligations as (
  select
    workspace_id,
    id as obligation_id,
    state,
    receipt_id,
    proof_state,
    proof_strength
  from core.obligations
  where state = 'resolved'
)
select
  count(*)                                              as open_obligations,
  count(*) filter (where is_overdue)                    as overdue_obligations,
  count(*) filter (where nullif(assigned_to, '') is null) as unowned_obligations,
  count(*) filter (
    where lower(coalesce(metadata ->> 'resolution_state', '')) = 'blocked'
       or lower(coalesce(metadata ->> 'status', '')) = 'blocked'
       or lower(coalesce(metadata ->> 'block_state', '')) = 'blocked'
  )                                                     as metadata_blocked_obligations,
  (
    select count(*)
    from resolved_obligations r
    where r.receipt_id is null
       or coalesce(r.proof_state, 'pending') not in ('linked', 'founder_attested')
       or coalesce(r.proof_strength, '') not in ('kernel_receipt', 'governed_manual_link')
  )                                                     as resolved_without_credible_proof
from open_actions;

-- Detail view for pressure review
select
  a.workspace_id,
  a.obligation_id,
  a.kind,
  a.priority,
  a.face,
  a.assigned_to,
  a.is_overdue,
  a.title,
  a.economic_ref_type,
  a.economic_ref_id,
  a.due_at,
  a.created_at
from core.v_operator_next_actions a
order by a.is_overdue desc, a.due_at asc nulls last, a.created_at asc
limit 50;

-- ============================================================================
-- 2) RECEIPT INTEGRITY AUDIT
-- ----------------------------------------------------------------------------
-- Answers:
-- - do resolved obligations reliably create receipts
-- - are there orphan obligation-chain receipts
-- - are there resolutions with no receipt trail
-- - are ledger receipts missing direct economic_ref attachment
-- ============================================================================

with resolved_obligations as (
  select
    o.workspace_id,
    o.id,
    o.object_id,
    o.receipt_id,
    o.proof_state,
    o.proof_strength
  from core.obligations o
  where o.state = 'resolved'
),
obligation_chain_receipts as (
  select
    r.id as receipt_id,
    r.workspace_id,
    r.chain_key,
    r.economic_ref_id,
    nullif(split_part(r.chain_key, ':', 2), '') as obligation_id_text
  from ledger.receipts r
  where r.chain_key like 'obligation:%'
),
validated_chain_receipts as (
  select
    ocr.receipt_id,
    ocr.workspace_id,
    ocr.chain_key,
    ocr.economic_ref_id,
    case
      when ocr.obligation_id_text ~* '^[0-9a-f-]{36}$' then ocr.obligation_id_text::uuid
      else null
    end as obligation_id
  from obligation_chain_receipts ocr
)
select
  (select count(*) from resolved_obligations) as resolved_obligations,
  (select count(*) from resolved_obligations where receipt_id is not null) as resolved_with_receipt_id,
  (select count(*) from resolved_obligations where coalesce(proof_state, 'pending') in ('linked', 'founder_attested')) as resolved_with_credible_proof_state,
  (
    select count(*)
    from resolved_obligations
    where receipt_id is null
       or coalesce(proof_state, 'pending') not in ('linked', 'founder_attested')
  ) as resolved_missing_receipt_trail,
  (
    select count(*)
    from validated_chain_receipts vcr
    left join core.obligations o
      on o.id = vcr.obligation_id
    where vcr.obligation_id is null
       or o.id is null
  ) as orphan_obligation_chain_receipts,
  (
    select count(*)
    from validated_chain_receipts
    where economic_ref_id is null
  ) as obligation_chain_receipts_missing_direct_economic_ref;

-- Detail rows for proof gaps
select
  o.workspace_id,
  o.id as obligation_id,
  o.object_id,
  o.obligation_type,
  o.resolved_at,
  o.receipt_id,
  o.proof_state,
  o.proof_strength,
  o.proof_note
from core.obligations o
where o.state = 'resolved'
  and (
    o.receipt_id is null
    or coalesce(o.proof_state, 'pending') not in ('linked', 'founder_attested')
  )
order by o.resolved_at desc nulls last
limit 50;

-- Detail rows for orphan obligation-chain receipts
with obligation_chain_receipts as (
  select
    r.id as receipt_id,
    r.workspace_id,
    r.chain_key,
    r.created_at,
    nullif(split_part(r.chain_key, ':', 2), '') as obligation_id_text
  from ledger.receipts r
  where r.chain_key like 'obligation:%'
),
validated_chain_receipts as (
  select
    ocr.*,
    case
      when ocr.obligation_id_text ~* '^[0-9a-f-]{36}$' then ocr.obligation_id_text::uuid
      else null
    end as obligation_id
  from obligation_chain_receipts ocr
)
select
  vcr.workspace_id,
  vcr.receipt_id,
  vcr.chain_key,
  vcr.created_at
from validated_chain_receipts vcr
left join core.obligations o
  on o.id = vcr.obligation_id
where vcr.obligation_id is null
   or o.id is null
order by vcr.created_at desc
limit 50;

-- ============================================================================
-- 3) STRIPE-TO-OBLIGATION SPOT CHECK
-- ----------------------------------------------------------------------------
-- Goal:
-- - take recent supported Stripe events
-- - derive the economic reference they should map to
-- - check whether billing objects/obligations/receipts exist
-- Notes:
-- - this is a bridge test, not just an ingest test
-- - empty matches after non-empty Stripe ingest usually means missing operationalization
-- ============================================================================

with recent_supported_events as (
  select
    se.workspace_id,
    se.stripe_event_id,
    se.stripe_type,
    se.received_at,
    se.payload,
    case
      when se.stripe_type = 'stripe.checkout.session.completed'
        then 'subscription'
      when se.stripe_type in ('stripe.invoice.paid', 'stripe.invoice.payment_failed')
        then 'invoice'
      when se.stripe_type in ('stripe.charge.dispute.created', 'stripe.charge.refunded')
        then 'payment'
      else 'unknown'
    end as expected_economic_ref_type,
    case
      when se.stripe_type = 'stripe.checkout.session.completed'
        then coalesce(se.payload -> 'data' -> 'object' ->> 'subscription', '')
      when se.stripe_type in ('stripe.invoice.paid', 'stripe.invoice.payment_failed')
        then coalesce(se.payload -> 'data' -> 'object' ->> 'id', '')
      when se.stripe_type = 'stripe.charge.dispute.created'
        then coalesce(
          se.payload -> 'data' -> 'object' ->> 'charge',
          se.payload -> 'data' -> 'object' ->> 'id',
          ''
        )
      when se.stripe_type = 'stripe.charge.refunded'
        then coalesce(se.payload -> 'data' -> 'object' ->> 'id', '')
      else ''
    end as expected_economic_ref_id
  from ingest.stripe_events se
  where se.stripe_type in (
    'stripe.checkout.session.completed',
    'stripe.invoice.paid',
    'stripe.invoice.payment_failed',
    'stripe.charge.dispute.created',
    'stripe.charge.refunded'
  )
),
recent_events_limited as (
  select *
  from recent_supported_events
  order by received_at desc
  limit 20
),
matching_objects as (
  select
    e.workspace_id,
    e.stripe_event_id,
    e.stripe_type,
    e.received_at,
    e.expected_economic_ref_type,
    e.expected_economic_ref_id,
    obj.id as object_id
  from recent_events_limited e
  left join core.objects obj
    on obj.workspace_id = e.workspace_id
   and coalesce(
        nullif(obj.metadata ->> 'economic_ref_type', ''),
        obj.kernel_class
      ) = e.expected_economic_ref_type
   and coalesce(
        nullif(obj.metadata ->> 'economic_ref_id', ''),
        nullif(obj.source_ref, '')
      ) = e.expected_economic_ref_id
),
matching_obligations as (
  select
    mo.workspace_id,
    mo.stripe_event_id,
    mo.stripe_type,
    mo.received_at,
    mo.expected_economic_ref_type,
    mo.expected_economic_ref_id,
    mo.object_id,
    o.id as obligation_id,
    o.state,
    o.proof_state,
    o.receipt_id
  from matching_objects mo
  left join core.obligations o
    on o.object_id = mo.object_id
),
matching_receipts as (
  select
    mo.*,
    r.receipt_id as projected_receipt_id
  from matching_obligations mo
  left join core.v_recent_receipts r
    on r.obligation_id = mo.obligation_id::text
)
select
  workspace_id,
  stripe_event_id,
  stripe_type,
  received_at,
  expected_economic_ref_type,
  expected_economic_ref_id,
  object_id,
  obligation_id,
  state,
  proof_state,
  receipt_id,
  projected_receipt_id
from matching_receipts
order by received_at desc;

-- Summary counts for the same spot check
with recent_supported_events as (
  select
    se.workspace_id,
    se.stripe_event_id,
    se.stripe_type,
    se.received_at,
    case
      when se.stripe_type = 'stripe.checkout.session.completed'
        then 'subscription'
      when se.stripe_type in ('stripe.invoice.paid', 'stripe.invoice.payment_failed')
        then 'invoice'
      when se.stripe_type in ('stripe.charge.dispute.created', 'stripe.charge.refunded')
        then 'payment'
      else 'unknown'
    end as expected_economic_ref_type,
    case
      when se.stripe_type = 'stripe.checkout.session.completed'
        then coalesce(se.payload -> 'data' -> 'object' ->> 'subscription', '')
      when se.stripe_type in ('stripe.invoice.paid', 'stripe.invoice.payment_failed')
        then coalesce(se.payload -> 'data' -> 'object' ->> 'id', '')
      when se.stripe_type = 'stripe.charge.dispute.created'
        then coalesce(
          se.payload -> 'data' -> 'object' ->> 'charge',
          se.payload -> 'data' -> 'object' ->> 'id',
          ''
        )
      when se.stripe_type = 'stripe.charge.refunded'
        then coalesce(se.payload -> 'data' -> 'object' ->> 'id', '')
      else ''
    end as expected_economic_ref_id
  from ingest.stripe_events se
  where se.stripe_type in (
    'stripe.checkout.session.completed',
    'stripe.invoice.paid',
    'stripe.invoice.payment_failed',
    'stripe.charge.dispute.created',
    'stripe.charge.refunded'
  )
),
recent_events_limited as (
  select *
  from recent_supported_events
  order by received_at desc
  limit 20
),
bridge_check as (
  select
    e.*,
    obj.id as object_id,
    o.id as obligation_id,
    o.receipt_id,
    o.proof_state
  from recent_events_limited e
  left join core.objects obj
    on obj.workspace_id = e.workspace_id
   and coalesce(
        nullif(obj.metadata ->> 'economic_ref_type', ''),
        obj.kernel_class
      ) = e.expected_economic_ref_type
   and coalesce(
        nullif(obj.metadata ->> 'economic_ref_id', ''),
        nullif(obj.source_ref, '')
      ) = e.expected_economic_ref_id
  left join core.obligations o
    on o.object_id = obj.id
)
select
  count(*) as sampled_supported_stripe_events,
  count(*) filter (where object_id is not null) as events_with_matching_object,
  count(*) filter (where obligation_id is not null) as events_with_matching_obligation,
  count(*) filter (where receipt_id is not null) as events_with_linked_receipt,
  count(*) filter (where coalesce(proof_state, 'pending') in ('linked', 'founder_attested')) as events_with_credible_proof
from bridge_check;
