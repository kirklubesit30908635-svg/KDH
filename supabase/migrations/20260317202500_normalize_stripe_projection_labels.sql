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
    ) as updated_at,
    coalesce(
      nullif(o.metadata ->> 'stripe_type', ''),
      nullif(obj.metadata ->> 'stripe_type', '')
    ) as stripe_type,
    coalesce(
      nullif(o.metadata ->> 'source_ref', ''),
      nullif(obj.metadata ->> 'source_ref', '')
    ) as source_ref,
    coalesce(
      nullif(o.metadata ->> 'surface', ''),
      nullif(obj.metadata ->> 'surface', '')
    ) as source_surface
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
    initcap(replace(obligation_type, '_', ' ')),
    initcap(replace(kernel_class, '_', ' ')) || ' Obligation'
  ) as title,
  coalesce(
    nullif(obligation_metadata ->> 'why', ''),
    nullif(object_metadata ->> 'why', ''),
    nullif(obligation_metadata ->> 'note', ''),
    nullif(object_metadata ->> 'note', ''),
    case
      when stripe_type is not null and source_ref is not null
        then 'Stripe ' || stripe_type || ' on ' || source_ref
      when stripe_type is not null
        then 'Stripe ' || stripe_type || ' received'
      when source_ref is not null
        then 'Reference ' || source_ref
      else null
    end
  ) as why,
  coalesce(
    nullif(obligation_metadata ->> 'face', ''),
    nullif(object_metadata ->> 'face', ''),
    case
      when source_surface = 'stripe_webhook' or stripe_type is not null
        then 'billing'
      else null
    end,
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
    source_ref,
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
with projected as (
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
    o.metadata as obligation_metadata,
    obj.metadata as object_metadata,
    obj.kernel_class,
    coalesce(
      nullif(o.metadata ->> 'stripe_type', ''),
      nullif(obj.metadata ->> 'stripe_type', '')
    ) as stripe_type,
    coalesce(
      nullif(o.metadata ->> 'source_ref', ''),
      nullif(obj.metadata ->> 'source_ref', '')
    ) as source_ref,
    coalesce(
      nullif(o.metadata ->> 'surface', ''),
      nullif(obj.metadata ->> 'surface', '')
    ) as source_surface,
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
  where et.name = 'obligation.resolved'
)
select
  workspace_id,
  receipt_id,
  obligation_id,
  object_id,
  receipt_type,
  created_at,
  actor_user_id,
  event_id,
  payload,
  sealed_at,
  sealed_by,
  coalesce(
    nullif(obligation_metadata ->> 'face', ''),
    nullif(object_metadata ->> 'face', ''),
    case
      when source_surface = 'stripe_webhook' or stripe_type is not null
        then 'billing'
      else null
    end,
    'unknown'
  ) as face,
  coalesce(
    nullif(obligation_metadata ->> 'economic_ref_type', ''),
    nullif(object_metadata ->> 'economic_ref_type', ''),
    kernel_class,
    'unknown'
  ) as economic_ref_type,
  coalesce(
    nullif(obligation_metadata ->> 'economic_ref_id', ''),
    nullif(object_metadata ->> 'economic_ref_id', ''),
    source_ref,
    nullif(object_metadata ->> 'period_key', ''),
    nullif(object_metadata ->> 'subscription_key', ''),
    object_id::text
  ) as economic_ref_id,
  ledger_event_id
from projected;

grant select on core.v_operator_next_actions to authenticated, service_role;
grant select on core.v_recent_receipts to authenticated, service_role;

comment on view core.v_operator_next_actions is
  'Disposable operator-action projection with normalized Stripe-derived labels from committed truth.';
comment on view core.v_recent_receipts is
  'Disposable receipt projection with normalized Stripe-derived labels from committed truth.';

commit;
