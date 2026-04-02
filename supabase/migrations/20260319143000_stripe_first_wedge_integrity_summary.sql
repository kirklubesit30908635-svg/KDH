begin;

create or replace view core.v_stripe_first_wedge_integrity_summary as
with wedge_obligations as (
  select
    o.workspace_id,
    o.id,
    o.state,
    o.opened_at,
    o.resolved_at,
    o.proof_state,
    o.receipt_id
  from core.obligations o
  join core.objects obj
    on obj.id = o.object_id
  where o.obligation_type in (
    'record_revenue',
    'recover_payment',
    'respond_to_dispute',
    'process_refund'
  )
    and coalesce(
      nullif(o.metadata ->> 'face', ''),
      nullif(obj.metadata ->> 'face', ''),
      case
        when coalesce(
          nullif(o.metadata ->> 'surface', ''),
          nullif(obj.metadata ->> 'surface', '')
        ) = 'stripe_webhook'
          or coalesce(
            nullif(o.metadata ->> 'stripe_type', ''),
            nullif(obj.metadata ->> 'stripe_type', '')
          ) is not null
        then 'billing'
        else null
      end,
      'unknown'
    ) = 'billing'
),
wedge_actions as (
  select
    workspace_id,
    obligation_id,
    is_overdue
  from core.v_operator_next_actions
  where face = 'billing'
    and kind in (
      'record_revenue',
      'recover_payment',
      'respond_to_dispute',
      'process_refund'
    )
),
wedge_receipts as (
  select
    r.workspace_id,
    r.obligation_id,
    r.created_at
  from core.v_recent_receipts r
  join wedge_obligations o
    on o.id::text = r.obligation_id
  where r.face = 'billing'
),
wedge_events as (
  select
    workspace_id,
    stripe_event_id
  from ingest.stripe_events
  where stripe_type in (
    'stripe.invoice.paid',
    'stripe.invoice.payment_failed',
    'stripe.charge.dispute.created',
    'stripe.charge.refunded'
  )
),
workspace_set as (
  select distinct workspace_id from wedge_obligations
  union
  select distinct workspace_id from wedge_receipts
  union
  select distinct workspace_id from wedge_events
),
obligation_totals as (
  select
    workspace_id,
    count(*) as total_obligations,
    count(*) filter (where state = 'resolved') as sealed_obligations,
    count(*) filter (where state != 'resolved') as open_obligations,
    avg(extract(epoch from (resolved_at - opened_at)) / 3600)
      filter (where state = 'resolved' and resolved_at is not null) as avg_closure_hours,
    count(*) filter (
      where state = 'resolved'
        and (
          receipt_id is null
          or coalesce(proof_state, 'pending') != 'linked'
        )
    ) as proof_lag
  from wedge_obligations
  group by workspace_id
),
overdue_totals as (
  select
    workspace_id,
    count(*) filter (where is_overdue) as overdue_obligations
  from wedge_actions
  group by workspace_id
),
receipt_totals as (
  select
    workspace_id,
    count(distinct obligation_id) as receipted_obligations,
    count(*) filter (where created_at >= now() - interval '7 days') as resolved_7d,
    count(*) filter (where created_at >= now() - interval '30 days') as resolved_30d
  from wedge_receipts
  group by workspace_id
),
stripe_totals as (
  select
    workspace_id,
    count(*) as stripe_events
  from wedge_events
  group by workspace_id
),
joined as (
  select
    w.workspace_id,
    coalesce(o.total_obligations, 0) as total_obligations,
    coalesce(o.sealed_obligations, 0) as sealed_obligations,
    coalesce(o.open_obligations, 0) as open_obligations,
    coalesce(d.overdue_obligations, 0) as overdue_obligations,
    coalesce(r.receipted_obligations, 0) as receipted_obligations,
    coalesce(r.resolved_7d, 0) as resolved_7d,
    coalesce(r.resolved_30d, 0) as resolved_30d,
    coalesce(s.stripe_events, 0) as stripe_events,
    coalesce(o.proof_lag, 0) as proof_lag,
    o.avg_closure_hours
  from workspace_set w
  left join obligation_totals o
    on o.workspace_id = w.workspace_id
  left join overdue_totals d
    on d.workspace_id = w.workspace_id
  left join receipt_totals r
    on r.workspace_id = w.workspace_id
  left join stripe_totals s
    on s.workspace_id = w.workspace_id
)
select
  workspace_id,
  total_obligations,
  sealed_obligations,
  open_obligations,
  overdue_obligations,
  resolved_7d,
  resolved_30d,
  stripe_events,
  least(stripe_events, total_obligations) as covered_events,
  case
    when total_obligations > 0 then round((sealed_obligations::numeric / total_obligations::numeric) * 100)
    else 100
  end::int as closure_rate,
  case
    when open_obligations > 0 then round((overdue_obligations::numeric / open_obligations::numeric) * 100)
    else 0
  end::int as breach_rate,
  case
    when stripe_events > 0 then round((least(stripe_events, total_obligations)::numeric / stripe_events::numeric) * 100)
    else 100
  end::int as event_coverage,
  greatest(stripe_events - total_obligations, 0) as events_awaiting,
  avg_closure_hours,
  case
    when avg_closure_hours is null then 80
    when avg_closure_hours <= 0.25 then 100
    when avg_closure_hours <= 1 then 95
    when avg_closure_hours <= 4 then 88
    when avg_closure_hours <= 12 then 72
    when avg_closure_hours <= 24 then 52
    when avg_closure_hours <= 48 then 32
    else 15
  end::int as latency_score,
  proof_lag,
  case
    when sealed_obligations > 0 then round((1 - proof_lag::numeric / sealed_obligations::numeric) * 100)
    else 100
  end::int as proof_score,
  case
    when total_obligations >= 20 then 'High'
    when total_obligations >= 5 then 'Medium'
    else 'Low'
  end::text as confidence,
  now() as computed_at
from joined;

grant select on core.v_stripe_first_wedge_integrity_summary to authenticated, service_role;
revoke select on core.v_integrity_summary from authenticated;

comment on view core.v_stripe_first_wedge_integrity_summary is
  'Stripe first-wedge integrity summary. Counts only supported billing-wedge obligations, receipts, and inbound Stripe movements.';

comment on view core.v_integrity_summary is
  'Legacy generic integrity alias retained for internal use only. Operator runtime reads core.v_stripe_first_wedge_integrity_summary.';

comment on view signals.v_integrity_summary is
  'Legacy generic signal aggregation retained for internal-only diagnostics. Operator runtime does not read this view.';

commit;
