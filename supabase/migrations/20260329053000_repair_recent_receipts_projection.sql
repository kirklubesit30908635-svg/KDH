begin;

create or replace view core.v_recent_receipts as
with projected as (
  select
    r.workspace_id,
    r.id as receipt_id,
    o.id::text as obligation_id,
    o.object_id,
    rt.name as receipt_type,
    r.created_at,
    coalesce(
      nullif(r.payload ->> 'actor_id', ''),
      nullif(r.payload -> 'metadata' ->> 'actor_id', ''),
      nullif(o.resolved_by_actor_id, ''),
      nullif(o.opened_by_actor_id, '')
    ) as actor_user_id,
    r.event_id,
    r.payload,
    r.created_at as sealed_at,
    coalesce(
      nullif(r.payload ->> 'actor_id', ''),
      nullif(r.payload -> 'metadata' ->> 'actor_id', ''),
      nullif(o.resolved_by_actor_id, ''),
      nullif(o.opened_by_actor_id, '')
    ) as sealed_by,
    o.metadata as obligation_metadata,
    obj.metadata as object_metadata,
    obj.kernel_class,
    coalesce(
      nullif(r.payload ->> 'stripe_type', ''),
      nullif(r.payload -> 'metadata' ->> 'stripe_type', ''),
      nullif(o.metadata ->> 'stripe_type', ''),
      nullif(obj.metadata ->> 'stripe_type', '')
    ) as stripe_type,
    coalesce(
      nullif(r.payload ->> 'source_ref', ''),
      nullif(r.payload -> 'metadata' ->> 'source_ref', ''),
      nullif(o.metadata ->> 'source_ref', ''),
      nullif(obj.metadata ->> 'source_ref', '')
    ) as source_ref,
    coalesce(
      nullif(r.payload ->> 'surface', ''),
      nullif(r.payload -> 'metadata' ->> 'surface', ''),
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
    nullif(payload ->> 'face', ''),
    nullif(payload -> 'metadata' ->> 'face', ''),
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
    nullif(payload ->> 'economic_ref_type', ''),
    nullif(payload -> 'metadata' ->> 'economic_ref_type', ''),
    nullif(obligation_metadata ->> 'economic_ref_type', ''),
    nullif(object_metadata ->> 'economic_ref_type', ''),
    case
      when stripe_type like 'invoice.%'
        then 'invoice'
      when stripe_type like 'payment_intent.%' or stripe_type like 'charge.%'
        then 'payment'
      when stripe_type like 'checkout.session.%' or stripe_type like 'customer.subscription.%'
        then 'subscription'
      when kernel_class in ('invoice', 'payment', 'subscription', 'customer')
        then kernel_class
      else 'unknown'
    end
  ) as economic_ref_type,
  coalesce(
    nullif(payload ->> 'economic_ref_id', ''),
    nullif(payload -> 'metadata' ->> 'economic_ref_id', ''),
    nullif(obligation_metadata ->> 'economic_ref_id', ''),
    nullif(object_metadata ->> 'economic_ref_id', ''),
    nullif(payload ->> 'stripe_invoice_id', ''),
    nullif(payload -> 'metadata' ->> 'stripe_invoice_id', ''),
    nullif(payload ->> 'stripe_subscription_id', ''),
    nullif(payload -> 'metadata' ->> 'stripe_subscription_id', ''),
    nullif(payload ->> 'stripe_checkout_session_id', ''),
    nullif(payload -> 'metadata' ->> 'stripe_checkout_session_id', ''),
    source_ref,
    nullif(payload ->> 'stripe_customer_id', ''),
    nullif(payload -> 'metadata' ->> 'stripe_customer_id', ''),
    nullif(object_metadata ->> 'period_key', ''),
    nullif(object_metadata ->> 'subscription_key', ''),
    object_id::text
  ) as economic_ref_id,
  ledger_event_id
from projected;

grant select on core.v_recent_receipts to authenticated, service_role;

comment on view core.v_recent_receipts is
  'Operator proof projection over committed obligation-resolution receipts with deterministic billing labels derived from committed truth.';

commit;
