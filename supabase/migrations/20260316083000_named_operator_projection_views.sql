begin;
create or replace view core.v_operator_next_actions as
with projected as (
  select
    o.workspace_id,
    o.id as obligation_id,
    o.object_id,
    o.obligation_type,
    o.state,
    o.opened_at,
    o.metadata as obligation_metadata,
    obj.kernel_class,
    obj.metadata as object_metadata,
    coalesce(
      core.try_parse_timestamptz(o.metadata ->> 'next_due_at'),
      core.try_parse_timestamptz(o.metadata ->> 'due_at')
    ) as due_at,
    coalesce(
      core.try_parse_timestamptz(o.metadata ->> 'last_touch_at'),
      o.opened_at
    ) as updated_at
  from core.obligations o
  join core.objects obj
    on obj.id = o.object_id
  where o.state != 'resolved'
)
select
  workspace_id,
  obligation_id,
  object_id,
  obligation_type as kind,
  state as status,
  case
    when obligation_metadata ->> 'severity' in ('critical', 'at_risk', 'due_today', 'queue')
      then obligation_metadata ->> 'severity'
    when due_at is not null and due_at < now()
      then 'critical'
    when due_at is not null and due_at <= now() + interval '24 hours'
      then 'due_today'
    when due_at is not null and due_at <= now() + interval '72 hours'
      then 'at_risk'
    else 'queue'
  end as priority,
  due_at,
  opened_at,
  updated_at,
  nullif(obligation_metadata ->> 'assigned_to', '') as assigned_to,
  true as is_actionable,
  coalesce(due_at < now(), false) as is_overdue,
  greatest(
    extract(epoch from updated_at)::bigint,
    extract(epoch from opened_at)::bigint
  ) as sort_key,
  coalesce(
    nullif(obligation_metadata ->> 'title', ''),
    nullif(object_metadata ->> 'title', ''),
    initcap(replace(kernel_class, '_', ' ')) || ' ' || initcap(replace(coalesce(obligation_metadata ->> 'action', 'obligation'), '_', ' '))
  ) as title,
  coalesce(
    nullif(obligation_metadata ->> 'why', ''),
    nullif(object_metadata ->> 'why', ''),
    nullif(obligation_metadata ->> 'note', ''),
    nullif(object_metadata ->> 'note', '')
  ) as why,
  coalesce(
    nullif(obligation_metadata ->> 'face', ''),
    nullif(object_metadata ->> 'face', ''),
    'unknown'
  ) as face,
  case
    when obligation_metadata ->> 'severity' in ('critical', 'at_risk', 'due_today', 'queue')
      then obligation_metadata ->> 'severity'
    when due_at is not null and due_at < now()
      then 'critical'
    when due_at is not null and due_at <= now() + interval '24 hours'
      then 'due_today'
    when due_at is not null and due_at <= now() + interval '72 hours'
      then 'at_risk'
    else 'queue'
  end as severity,
  opened_at as created_at,
  extract(epoch from (now() - opened_at)) / 3600 as age_hours,
  coalesce(due_at < now(), false) as is_breach,
  coalesce(
    nullif(obligation_metadata ->> 'economic_ref_type', ''),
    nullif(object_metadata ->> 'economic_ref_type', ''),
    kernel_class,
    'unknown'
  ) as economic_ref_type,
  coalesce(
    nullif(obligation_metadata ->> 'economic_ref_id', ''),
    nullif(object_metadata ->> 'economic_ref_id', ''),
    nullif(object_metadata ->> 'period_key', ''),
    nullif(object_metadata ->> 'subscription_key', ''),
    object_id::text
  ) as economic_ref_id,
  coalesce(
    nullif(obligation_metadata ->> 'location', ''),
    nullif(object_metadata ->> 'location', '')
  ) as location
from projected;
create or replace view core.v_recent_receipts as
select
  r.workspace_id,
  r.id as receipt_id,
  o.id::text as obligation_id,
  o.object_id,
  rt.name as receipt_type,
  coalesce(
    core.try_parse_timestamptz(r.payload ->> 'resolved_at'),
    o.resolved_at,
    r.created_at
  ) as created_at,
  coalesce(
    nullif(r.payload ->> 'actor_id', ''),
    nullif(o.resolved_by_actor_id, ''),
    nullif(o.opened_by_actor_id, '')
  ) as actor_user_id,
  r.event_id,
  r.payload,
  coalesce(
    core.try_parse_timestamptz(r.payload ->> 'resolved_at'),
    o.resolved_at,
    r.created_at
  ) as sealed_at,
  coalesce(
    nullif(r.payload ->> 'actor_id', ''),
    nullif(o.resolved_by_actor_id, ''),
    nullif(o.opened_by_actor_id, '')
  ) as sealed_by,
  coalesce(
    nullif(o.metadata ->> 'face', ''),
    nullif(obj.metadata ->> 'face', ''),
    'unknown'
  ) as face,
  coalesce(
    nullif(o.metadata ->> 'economic_ref_type', ''),
    nullif(obj.metadata ->> 'economic_ref_type', ''),
    obj.kernel_class,
    'unknown'
  ) as economic_ref_type,
  coalesce(
    nullif(o.metadata ->> 'economic_ref_id', ''),
    nullif(obj.metadata ->> 'economic_ref_id', ''),
    nullif(obj.metadata ->> 'period_key', ''),
    nullif(obj.metadata ->> 'subscription_key', ''),
    o.object_id::text
  ) as economic_ref_id,
  r.event_id as ledger_event_id
from ledger.receipts r
join ledger.events e
  on e.id = r.event_id
join registry.event_types et
  on et.id = e.event_type_id
join registry.receipt_types rt
  on rt.id = r.receipt_type_id
join core.obligations o
  on r.chain_key = 'obligation:' || o.id::text
join core.objects obj
  on obj.id = o.object_id
where et.name = 'obligation.resolved';
create or replace view signals.v_integrity_summary as
with workspace_set as (
  select distinct workspace_id from core.obligations
  union
  select distinct workspace_id from core.v_recent_receipts
  union
  select distinct workspace_id from ingest.stripe_events
),
obligation_totals as (
  select
    workspace_id,
    count(*) as total_obligations,
    count(*) filter (where state = 'resolved') as sealed_obligations,
    count(*) filter (where state != 'resolved') as open_obligations,
    avg(extract(epoch from (resolved_at - opened_at)) / 3600)
      filter (where state = 'resolved' and resolved_at is not null) as avg_closure_hours
  from core.obligations
  group by workspace_id
),
overdue_totals as (
  select
    workspace_id,
    count(*) filter (where is_overdue) as overdue_obligations
  from core.v_operator_next_actions
  group by workspace_id
),
receipt_totals as (
  select
    workspace_id,
    count(distinct obligation_id) as receipted_obligations,
    count(*) filter (where created_at >= now() - interval '7 days') as resolved_7d,
    count(*) filter (where created_at >= now() - interval '30 days') as resolved_30d
  from core.v_recent_receipts
  group by workspace_id
),
stripe_totals as (
  select
    s.workspace_id,
    count(*) as stripe_events,
    count(e.id) as covered_events
  from ingest.stripe_events s
  left join ledger.events e
    on e.workspace_id = s.workspace_id
   and e.idempotency_key = s.stripe_event_id
  group by s.workspace_id
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
    coalesce(s.covered_events, 0) as covered_events,
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
  covered_events,
  case
    when total_obligations > 0 then round((sealed_obligations::numeric / total_obligations::numeric) * 100)
    else 100
  end::int as closure_rate,
  case
    when open_obligations > 0 then round((overdue_obligations::numeric / open_obligations::numeric) * 100)
    else 0
  end::int as breach_rate,
  case
    when stripe_events > 0 then round((covered_events::numeric / stripe_events::numeric) * 100)
    else 100
  end::int as event_coverage,
  greatest(stripe_events - covered_events, 0) as events_awaiting,
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
  greatest(sealed_obligations - receipted_obligations, 0) as proof_lag,
  case
    when sealed_obligations > 0 then greatest(0, round((1 - greatest(sealed_obligations - receipted_obligations, 0)::numeric / sealed_obligations::numeric) * 100))
    else 100
  end::int as proof_score,
  case
    when total_obligations >= 20 then 'High'
    when total_obligations >= 5 then 'Medium'
    else 'Low'
  end as confidence,
  round(
    least(
      100,
      greatest(
        0,
        (
          0.30 * (
            case
              when total_obligations > 0 then round((sealed_obligations::numeric / total_obligations::numeric) * 100)
              else 100
            end *
            case
              when avg_closure_hours is null then 1.0
              when avg_closure_hours <= 0.25 then 1.05
              when avg_closure_hours <= 1 then 1.00
              when avg_closure_hours <= 4 then 0.95
              when avg_closure_hours <= 12 then 0.90
              else 0.80
            end
          ) +
          0.25 * (
            100 - case
              when open_obligations > 0 then round((overdue_obligations::numeric / open_obligations::numeric) * 100)
              else 0
            end
          ) +
          0.20 * (
            case
              when stripe_events > 0 then round((covered_events::numeric / stripe_events::numeric) * 100)
              else 100
            end
          ) +
          0.15 * (
            case
              when avg_closure_hours is null then 80
              when avg_closure_hours <= 0.25 then 100
              when avg_closure_hours <= 1 then 95
              when avg_closure_hours <= 4 then 88
              when avg_closure_hours <= 12 then 72
              when avg_closure_hours <= 24 then 52
              when avg_closure_hours <= 48 then 32
              else 15
            end
          ) +
          0.10 * (
            case
              when sealed_obligations > 0 then greatest(0, round((1 - greatest(sealed_obligations - receipted_obligations, 0)::numeric / sealed_obligations::numeric) * 100))
              else 100
            end
          )
        )
      )
    )
  )::int as integrity_score,
  now() as computed_at
from joined;
create or replace view core.v_next_actions as
select
  obligation_id,
  title,
  why,
  face,
  severity,
  due_at,
  created_at,
  age_hours,
  is_breach,
  economic_ref_type,
  economic_ref_id,
  location
from core.v_operator_next_actions;
create or replace view core.v_receipts as
select
  receipt_id,
  obligation_id,
  sealed_at,
  sealed_by,
  face,
  economic_ref_type,
  economic_ref_id,
  ledger_event_id,
  payload
from core.v_recent_receipts;
grant select on core.v_operator_next_actions to authenticated, service_role;
grant select on core.v_recent_receipts to authenticated, service_role;
grant select on signals.v_integrity_summary to authenticated, service_role;
grant select on core.v_next_actions to authenticated, service_role;
grant select on core.v_receipts to authenticated, service_role;
comment on view core.v_operator_next_actions is
  'Disposable operator-action projection derived from governed obligation truth.';
comment on view core.v_recent_receipts is
  'Disposable receipt projection derived from committed obligation-resolution receipts.';
comment on view signals.v_integrity_summary is
  'Workspace-scoped integrity summary derived from kernel truth and projection counts.';
commit;
