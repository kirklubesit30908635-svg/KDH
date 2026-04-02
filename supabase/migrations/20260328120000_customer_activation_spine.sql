create or replace view core.v_customer_activation_spine as
with me as (
  select auth.uid() as auth_uid
),

operator as (
  select o.*
  from core.operators o
  join me on o.auth_uid = me.auth_uid
),

membership as (
  select m.*
  from core.memberships m
  join operator o on m.operator_id = o.id
  order by m.created_at desc
  limit 1
),

workspace as (
  select w.*
  from core.workspaces w
  join membership m on w.id = m.workspace_id
),

tenant as (
  select t.*
  from core.tenants t
  join workspace w on t.id = w.tenant_id
),

stripe_connection as (
  select c.*
  from core.provider_connections c
  join workspace w on c.workspace_id = w.id
  where c.provider = 'stripe'
  order by c.created_at desc
  limit 1
),

events as (
  select count(*) as total_events
  from ledger.events e
  join workspace w on e.workspace_id = w.id
),

obligations as (
  select count(*) as total_obligations
  from core.obligations o
  join workspace w on o.workspace_id = w.id
),

receipts as (
  select count(*) as total_receipts
  from ledger.receipts r
  join workspace w on r.workspace_id = w.id
)

select
  o.auth_uid as user_id,

  t.id as tenant_id,
  t.name as tenant_name,

  w.id as workspace_id,

  o.stripe_subscription_id as subscription_id,
  o.subscription_status as subscription_status,

  case
    when c.id is null then 'not_connected'
    when c.is_active then 'connected'
    else 'not_connected'
  end as stripe_connection_status,

  coalesce(e.total_events, 0) as total_events,
  coalesce(ob.total_obligations, 0) as total_obligations,
  coalesce(r.total_receipts, 0) as total_receipts,

  case
    when o.stripe_subscription_id is null then 'subscribe'
    when w.id is null then 'provisioning'
    when c.id is null then 'connect_stripe'
    when coalesce(e.total_events, 0) = 0 then 'wait_for_first_event'
    when coalesce(r.total_receipts, 0) = 0 then 'wait_for_receipt'
    else 'open_dashboard'
  end as next_action

from operator o
left join membership m on true
left join workspace w on true
left join tenant t on true
left join stripe_connection c on true
left join events e on true
left join obligations ob on true
left join receipts r on true;
create or replace function api.customer_activation_status()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'user_id', user_id,
    'tenant_id', tenant_id,
    'tenant_name', tenant_name,
    'workspace_id', workspace_id,
    'subscription_status', subscription_status,
    'stripe_connection_status', stripe_connection_status,
    'total_events', total_events,
    'total_obligations', total_obligations,
    'total_receipts', total_receipts,
    'next_action', next_action
  )
  from core.v_customer_activation_spine;
$$;