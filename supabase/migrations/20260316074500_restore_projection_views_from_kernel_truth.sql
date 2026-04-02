begin;
create or replace function core.try_parse_timestamptz(p_value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;

  return p_value::timestamptz;
exception
  when others then
    return null;
end;
$$;
create or replace view core.v_next_actions as
with projected as (
  select
    o.id as obligation_id,
    o.state,
    o.opened_at,
    o.object_id,
    o.metadata as obligation_metadata,
    obj.kernel_class,
    obj.metadata as object_metadata,
    coalesce(
      core.try_parse_timestamptz(o.metadata ->> 'next_due_at'),
      core.try_parse_timestamptz(o.metadata ->> 'due_at')
    ) as due_at
  from core.obligations o
  join core.objects obj
    on obj.id = o.object_id
  where o.state != 'resolved'
)
select
  obligation_id,
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
  due_at,
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
create or replace view core.v_receipts as
select
  r.id as receipt_id,
  o.id::text as obligation_id,
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
  r.event_id as ledger_event_id,
  r.payload
from ledger.receipts r
join ledger.events e
  on e.id = r.event_id
join registry.event_types et
  on et.id = e.event_type_id
join core.obligations o
  on r.chain_key = 'obligation:' || o.id::text
join core.objects obj
  on obj.id = o.object_id
where et.name = 'obligation.resolved';
grant execute on function core.try_parse_timestamptz(text) to authenticated, service_role;
grant select on core.v_next_actions to authenticated, service_role;
grant select on core.v_receipts to authenticated, service_role;
commit;
