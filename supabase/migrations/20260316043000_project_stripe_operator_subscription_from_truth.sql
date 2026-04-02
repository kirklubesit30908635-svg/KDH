-- =============================================================
-- Retire webhook-local Stripe projection writes.
--
-- Operator subscription state becomes a downstream projection
-- derived from committed kernel truth, not webhook branching.
-- =============================================================

create or replace function api.project_operator_subscription_event(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_event_type      text;
  v_workspace_id    uuid;
  v_payload         jsonb;
  v_object          jsonb;
  v_auth_uid_text   text;
  v_customer_id     text;
  v_subscription_id text;
  v_rows_updated    integer := 0;
begin
  select et.name, e.workspace_id, e.payload
    into v_event_type, v_workspace_id, v_payload
    from ledger.events e
    join registry.event_types et
      on et.id = e.event_type_id
   where e.id = p_event_id;

  if v_event_type is null then
    raise exception 'ledger event not found: %', p_event_id
      using errcode = 'no_data_found';
  end if;

  v_object := coalesce(v_payload -> 'data' -> 'object', '{}'::jsonb);

  if v_event_type = 'stripe.checkout.session.completed' then
    v_auth_uid_text := nullif(v_object #>> '{metadata,operator_auth_uid}', '');
    v_customer_id := nullif(v_object ->> 'customer', '');
    v_subscription_id := nullif(v_object ->> 'subscription', '');

    if v_auth_uid_text is null or v_customer_id is null or v_subscription_id is null then
      return jsonb_build_object(
        'event_id', p_event_id,
        'event_type', v_event_type,
        'projection', 'skipped'
      );
    end if;

    update core.operators o
       set stripe_customer_id = v_customer_id,
           stripe_subscription_id = v_subscription_id,
           subscription_status = 'active'
     where o.auth_uid::text = v_auth_uid_text
       and exists (
         select 1
           from core.memberships m
          where m.operator_id = o.id
            and m.workspace_id = v_workspace_id
       );

    get diagnostics v_rows_updated = row_count;

    return jsonb_build_object(
      'event_id', p_event_id,
      'event_type', v_event_type,
      'projection', case when v_rows_updated > 0 then 'updated' else 'skipped' end,
      'rows_updated', v_rows_updated
    );
  end if;

  if v_event_type = 'stripe.customer.subscription.deleted' then
    v_customer_id := nullif(v_object ->> 'customer', '');

    if v_customer_id is null then
      return jsonb_build_object(
        'event_id', p_event_id,
        'event_type', v_event_type,
        'projection', 'skipped'
      );
    end if;

    update core.operators o
       set subscription_status = 'inactive'
     where o.stripe_customer_id = v_customer_id
       and exists (
         select 1
           from core.memberships m
          where m.operator_id = o.id
            and m.workspace_id = v_workspace_id
       );

    get diagnostics v_rows_updated = row_count;

    return jsonb_build_object(
      'event_id', p_event_id,
      'event_type', v_event_type,
      'projection', case when v_rows_updated > 0 then 'updated' else 'skipped' end,
      'rows_updated', v_rows_updated
    );
  end if;

  return jsonb_build_object(
    'event_id', p_event_id,
    'event_type', v_event_type,
    'projection', 'skipped'
  );
end;
$$;
create or replace function api.rebuild_operator_subscription_projection(
  p_workspace_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_event           record;
  v_reset_operators integer := 0;
  v_replayed_events integer := 0;
begin
  with relevant_events as (
    select et.name as event_type, e.payload
      from ledger.events e
      join registry.event_types et
        on et.id = e.event_type_id
     where et.name in (
       'stripe.checkout.session.completed',
       'stripe.customer.subscription.deleted'
     )
       and (p_workspace_id is null or e.workspace_id = p_workspace_id)
  ),
  touched_checkout_auth_uids as (
    select distinct nullif(payload #>> '{data,object,metadata,operator_auth_uid}', '') as auth_uid_text
      from relevant_events
     where event_type = 'stripe.checkout.session.completed'
  ),
  touched_deleted_customers as (
    select distinct nullif(payload #>> '{data,object,customer}', '') as stripe_customer_id
      from relevant_events
     where event_type = 'stripe.customer.subscription.deleted'
  ),
  touched_operator_ids as (
    select distinct o.id
      from core.operators o
     where o.auth_uid::text in (
             select auth_uid_text
               from touched_checkout_auth_uids
              where auth_uid_text is not null
           )
        or o.stripe_customer_id in (
             select stripe_customer_id
               from touched_deleted_customers
              where stripe_customer_id is not null
           )
  )
  update core.operators
     set stripe_customer_id = null,
         stripe_subscription_id = null,
         subscription_status = 'inactive'
   where id in (select id from touched_operator_ids);

  get diagnostics v_reset_operators = row_count;

  for v_event in
    select e.id
      from ledger.events e
      join registry.event_types et
        on et.id = e.event_type_id
     where et.name in (
       'stripe.checkout.session.completed',
       'stripe.customer.subscription.deleted'
     )
       and (p_workspace_id is null or e.workspace_id = p_workspace_id)
     order by e.created_at, e.seq, e.id
  loop
    perform api.project_operator_subscription_event(v_event.id);
    v_replayed_events := v_replayed_events + 1;
  end loop;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'reset_operators', v_reset_operators,
    'replayed_events', v_replayed_events
  );
end;
$$;
revoke all on function api.project_operator_subscription_event(uuid) from public;
revoke all on function api.rebuild_operator_subscription_projection(uuid) from public;
grant execute on function api.project_operator_subscription_event(uuid) to service_role;
grant execute on function api.rebuild_operator_subscription_projection(uuid) to service_role;
