begin;

insert into core.reason_codes (code, category)
values ('subscription_deleted', 'external')
on conflict (code) do nothing;

insert into core.object_class_postures (kernel_class, economic_posture)
values ('subscription', 'direct_revenue')
on conflict (kernel_class, economic_posture) do nothing;

update core.objects
   set kernel_class = 'subscription',
       source_ref = coalesce(
         source_ref,
         nullif(metadata ->> 'stripe_subscription_id', ''),
         nullif(metadata ->> 'economic_ref_id', '')
       ),
       metadata = coalesce(metadata, '{}'::jsonb)
         || jsonb_strip_nulls(
              jsonb_build_object(
                'title', coalesce(nullif(metadata ->> 'title', ''), 'Operationalize subscription'),
                'origin', coalesce(nullif(metadata ->> 'origin', ''), 'stripe_checkout'),
                'checkout_session_id',
                  coalesce(
                    nullif(metadata ->> 'checkout_session_id', ''),
                    nullif(metadata ->> 'stripe_checkout_session_id', '')
                  ),
                'stripe_checkout_session_id',
                  coalesce(
                    nullif(metadata ->> 'stripe_checkout_session_id', ''),
                    nullif(metadata ->> 'checkout_session_id', '')
                  ),
                'economic_ref_type', 'subscription'
              )
            )
 where kernel_class = 'operator_access_subscription';

update core.obligations
   set obligation_type = 'operationalize_subscription',
       idempotency_key = coalesce(
         idempotency_key,
         nullif(metadata ->> 'idempotency_key', ''),
         case
           when coalesce(metadata ->> 'stripe_subscription_id', metadata ->> 'economic_ref_id', '') <> ''
             then 'stripe:operationalize_subscription:' ||
                  coalesce(metadata ->> 'stripe_subscription_id', metadata ->> 'economic_ref_id')
           else null
         end
       ),
       due_at = coalesce(
         due_at,
         core.try_parse_timestamptz(metadata ->> 'due_at')
       ),
       metadata = coalesce(metadata, '{}'::jsonb)
         || jsonb_strip_nulls(
              jsonb_build_object(
                'title', coalesce(nullif(metadata ->> 'title', ''), 'Operationalize subscription'),
                'action', 'operationalize_subscription',
                'resolution_required',
                  coalesce(
                    nullif(metadata ->> 'resolution_required', ''),
                    'receipt-backed subscription operationalization'
                  ),
                'checkout_session_id',
                  coalesce(
                    nullif(metadata ->> 'checkout_session_id', ''),
                    nullif(metadata ->> 'stripe_checkout_session_id', '')
                  ),
                'stripe_checkout_session_id',
                  coalesce(
                    nullif(metadata ->> 'stripe_checkout_session_id', ''),
                    nullif(metadata ->> 'checkout_session_id', '')
                  ),
                'idempotency_key',
                  coalesce(
                    nullif(metadata ->> 'idempotency_key', ''),
                    case
                      when coalesce(metadata ->> 'stripe_subscription_id', metadata ->> 'economic_ref_id', '') <> ''
                        then 'stripe:operationalize_subscription:' ||
                             coalesce(metadata ->> 'stripe_subscription_id', metadata ->> 'economic_ref_id')
                      else null
                    end
                  )
              )
            )
 where obligation_type = 'activate_operator_access';

create or replace function api.project_operator_subscription_event(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_event_type          text;
  v_workspace_id        uuid;
  v_payload             jsonb;
  v_object              jsonb;
  v_stripe_event_id     text;
  v_actor_id            text;
  v_auth_uid_text       text;
  v_customer_id         text;
  v_subscription_id     text;
  v_checkout_session_id text;
  v_invoice_id          text;
  v_payment_status      text;
  v_mode                text;
  v_operator_id         uuid;
  v_object_id           uuid;
  v_obligation          core.obligations%rowtype;
  v_rows_updated        integer := 0;
  v_due_at              timestamptz := now() + interval '1 hour';
  v_now                 timestamptz := now();
  v_open_event_id       uuid;
  v_open_receipt_id     uuid;
  v_close_event_id      uuid;
  v_close_receipt_id    uuid;
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
  v_stripe_event_id := nullif(v_payload ->> 'id', '');
  v_actor_id := 'stripe:' || coalesce(v_stripe_event_id, p_event_id::text);

  if v_event_type = 'stripe.checkout.session.completed' then
    v_mode := nullif(v_object ->> 'mode', '');
    v_auth_uid_text := nullif(v_object #>> '{metadata,operator_auth_uid}', '');
    v_customer_id := nullif(v_object ->> 'customer', '');
    v_subscription_id := nullif(v_object ->> 'subscription', '');
    v_checkout_session_id := nullif(v_object ->> 'id', '');
    v_invoice_id := nullif(v_object ->> 'invoice', '');
    v_payment_status := nullif(v_object ->> 'payment_status', '');

    if v_mode is distinct from 'subscription' then
      return jsonb_build_object(
        'event_id', p_event_id,
        'event_type', v_event_type,
        'projection', 'skipped',
        'reason', 'checkout mode is not subscription'
      );
    end if;

    if v_subscription_id is null then
      return jsonb_build_object(
        'event_id', p_event_id,
        'event_type', v_event_type,
        'projection', 'skipped',
        'reason', 'missing stripe subscription id'
      );
    end if;

    if v_payment_status is not null and v_payment_status not in ('paid', 'no_payment_required') then
      return jsonb_build_object(
        'event_id', p_event_id,
        'event_type', v_event_type,
        'projection', 'skipped',
        'reason', 'checkout session is not yet paid'
      );
    end if;

    perform pg_advisory_xact_lock(
      hashtext(
        'stripe-subscription-projection:' || v_workspace_id::text || ':' || v_subscription_id
      )::bigint
    );

    select o.id
      into v_operator_id
      from core.operators o
     where exists (
             select 1
               from core.memberships m
              where m.operator_id = o.id
                and m.workspace_id = v_workspace_id
           )
       and (
             (v_auth_uid_text is not null and o.auth_uid::text = v_auth_uid_text)
          or (v_customer_id is not null and o.stripe_customer_id = v_customer_id)
           )
     order by case
                when v_auth_uid_text is not null and o.auth_uid::text = v_auth_uid_text then 0
                else 1
              end
     limit 1;

    if v_operator_id is not null then
      update core.operators o
         set stripe_customer_id = coalesce(v_customer_id, o.stripe_customer_id),
             stripe_subscription_id = v_subscription_id,
             subscription_status = 'active'
       where o.id = v_operator_id;

      get diagnostics v_rows_updated = row_count;
    end if;

    select obj.id
      into v_object_id
      from core.objects obj
     where obj.workspace_id = v_workspace_id
       and obj.kernel_class = 'subscription'
       and obj.source_ref = v_subscription_id
     order by obj.acknowledged_at desc, obj.created_at desc
     limit 1;

    if v_object_id is null then
      insert into core.objects(
        workspace_id,
        kernel_class,
        economic_posture,
        status,
        acknowledged_by_actor_class,
        acknowledged_by_actor_id,
        source_ref,
        metadata
      )
      values (
        v_workspace_id,
        'subscription',
        'direct_revenue',
        'under_governance',
        'system',
        v_actor_id,
        v_subscription_id,
        jsonb_strip_nulls(jsonb_build_object(
          'title', 'Operationalize subscription',
          'why', 'Paid Stripe subscription checkout completed and must be operationalized from the governed operator queue.',
          'face', 'billing',
          'surface', 'stripe_webhook',
          'origin', 'stripe_checkout',
          'source_ref', v_subscription_id,
          'source_event_id', p_event_id::text,
          'stripe_event_id', v_stripe_event_id,
          'stripe_type', v_event_type,
          'stripe_customer_id', v_customer_id,
          'stripe_subscription_id', v_subscription_id,
          'stripe_invoice_id', v_invoice_id,
          'checkout_session_id', v_checkout_session_id,
          'stripe_checkout_session_id', v_checkout_session_id,
          'operator_auth_uid', v_auth_uid_text,
          'operator_identity_id', v_operator_id::text,
          'economic_ref_type', 'subscription',
          'economic_ref_id', v_subscription_id,
          'subscription_key', v_subscription_id
        ))
      )
      returning id into v_object_id;
    else
      update core.objects
         set status = case
                        when status = 'terminal_resolution_recorded' then status
                        else 'under_governance'
                      end,
             source_ref = coalesce(source_ref, v_subscription_id),
             metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
               'title', 'Operationalize subscription',
               'why', 'Paid Stripe subscription checkout completed and must be operationalized from the governed operator queue.',
               'face', 'billing',
               'surface', 'stripe_webhook',
               'origin', 'stripe_checkout',
               'source_ref', v_subscription_id,
               'source_event_id', p_event_id::text,
               'stripe_event_id', v_stripe_event_id,
               'stripe_type', v_event_type,
               'stripe_customer_id', v_customer_id,
               'stripe_subscription_id', v_subscription_id,
               'stripe_invoice_id', v_invoice_id,
               'checkout_session_id', v_checkout_session_id,
               'stripe_checkout_session_id', v_checkout_session_id,
               'operator_auth_uid', v_auth_uid_text,
               'operator_identity_id', v_operator_id::text,
               'economic_ref_type', 'subscription',
               'economic_ref_id', v_subscription_id,
               'subscription_key', v_subscription_id
             ))
       where id = v_object_id;
    end if;

    select *
      into v_obligation
      from core.obligations o
     where o.workspace_id = v_workspace_id
       and o.object_id = v_object_id
       and o.obligation_type = 'operationalize_subscription'
     order by case when o.state != 'resolved' then 0 else 1 end, o.opened_at desc
     limit 1;

    if v_obligation.id is null then
      insert into core.obligations(
        workspace_id,
        object_id,
        obligation_type,
        state,
        opened_by_actor_class,
        opened_by_actor_id,
        idempotency_key,
        due_at,
        metadata
      )
      values (
        v_workspace_id,
        v_object_id,
        'operationalize_subscription',
        'open',
        'system',
        v_actor_id,
        'stripe:operationalize_subscription:' || v_subscription_id,
        v_due_at,
        jsonb_strip_nulls(jsonb_build_object(
          'title', 'Operationalize subscription',
          'why', 'Bind the canonical subscription to operational follow-through and close the revenue activation loop.',
          'face', 'billing',
          'surface', 'stripe_webhook',
          'origin', 'stripe_checkout',
          'source_ref', v_subscription_id,
          'source_event_id', p_event_id::text,
          'stripe_event_id', v_stripe_event_id,
          'stripe_type', v_event_type,
          'stripe_customer_id', v_customer_id,
          'stripe_subscription_id', v_subscription_id,
          'stripe_invoice_id', v_invoice_id,
          'checkout_session_id', v_checkout_session_id,
          'stripe_checkout_session_id', v_checkout_session_id,
          'operator_auth_uid', v_auth_uid_text,
          'operator_identity_id', v_operator_id::text,
          'economic_ref_type', 'subscription',
          'economic_ref_id', v_subscription_id,
          'subscription_key', v_subscription_id,
          'action', 'operationalize_subscription',
          'severity', 'critical',
          'due_at', v_due_at,
          'return_surface', '/command',
          'resolution_required', 'receipt-backed subscription operationalization',
          'idempotency_key', 'stripe:operationalize_subscription:' || v_subscription_id
        ))
      )
      returning * into v_obligation;

      select e.event_id
        into v_open_event_id
        from api.append_event(
          v_workspace_id,
          'obligation:' || v_obligation.id::text,
          'obligation.created',
          jsonb_strip_nulls(jsonb_build_object(
            'obligation_id', v_obligation.id,
            'object_id', v_object_id,
            'movement_type', 'checkout_session_completed',
            'source_event_id', p_event_id,
            'stripe_event_id', v_stripe_event_id,
            'stripe_customer_id', v_customer_id,
            'stripe_subscription_id', v_subscription_id,
            'stripe_invoice_id', v_invoice_id,
            'checkout_session_id', v_checkout_session_id,
            'operator_identity_id', v_operator_id,
            'required_action', 'operationalize_subscription',
            'occurred_at', v_now,
            'recorded_at', v_now
          )),
          'stripe:operationalize_subscription:open:' || v_subscription_id
        ) e;

      select r.receipt_id
        into v_open_receipt_id
        from api.emit_receipt(
          v_workspace_id,
          v_open_event_id,
          'obligation:' || v_obligation.id::text,
          'obligation_opened',
          jsonb_strip_nulls(jsonb_build_object(
            'obligation_id', v_obligation.id,
            'object_id', v_object_id,
            'movement_type', 'checkout_session_completed',
            'source_event_id', p_event_id,
            'stripe_event_id', v_stripe_event_id,
            'stripe_customer_id', v_customer_id,
            'stripe_subscription_id', v_subscription_id,
            'stripe_invoice_id', v_invoice_id,
            'checkout_session_id', v_checkout_session_id,
            'operator_identity_id', v_operator_id,
            'required_action', 'operationalize_subscription',
            'occurred_at', v_now,
            'recorded_at', v_now
          )),
          'stripe:operationalize_subscription:open-receipt:' || v_subscription_id
        ) r;
    else
      update core.obligations
         set due_at = case
                        when state = 'resolved' then due_at
                        else coalesce(due_at, v_due_at)
                      end,
             idempotency_key = coalesce(
               idempotency_key,
               'stripe:operationalize_subscription:' || v_subscription_id
             ),
             metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
               'title', 'Operationalize subscription',
               'why', 'Bind the canonical subscription to operational follow-through and close the revenue activation loop.',
               'face', 'billing',
               'surface', 'stripe_webhook',
               'origin', 'stripe_checkout',
               'source_ref', v_subscription_id,
               'source_event_id', p_event_id::text,
               'stripe_event_id', v_stripe_event_id,
               'stripe_type', v_event_type,
               'stripe_customer_id', v_customer_id,
               'stripe_subscription_id', v_subscription_id,
               'stripe_invoice_id', v_invoice_id,
               'checkout_session_id', v_checkout_session_id,
               'stripe_checkout_session_id', v_checkout_session_id,
               'operator_auth_uid', v_auth_uid_text,
               'operator_identity_id', v_operator_id::text,
               'economic_ref_type', 'subscription',
               'economic_ref_id', v_subscription_id,
               'subscription_key', v_subscription_id,
               'action', 'operationalize_subscription',
               'severity', 'critical',
               'due_at', coalesce(v_obligation.due_at, v_due_at),
               'return_surface', '/command',
               'resolution_required', 'receipt-backed subscription operationalization',
               'idempotency_key', coalesce(
                 v_obligation.idempotency_key,
                 'stripe:operationalize_subscription:' || v_subscription_id
               )
             ))
       where id = v_obligation.id;
    end if;

    return jsonb_strip_nulls(jsonb_build_object(
      'event_id', p_event_id,
      'event_type', v_event_type,
      'projection', 'updated',
      'rows_updated', v_rows_updated,
      'operator_id', v_operator_id,
      'object_id', v_object_id,
      'obligation_id', v_obligation.id,
      'obligation_open_event_id', v_open_event_id,
      'obligation_open_receipt_id', v_open_receipt_id
    ));
  end if;

  if v_event_type = 'stripe.customer.subscription.deleted' then
    v_customer_id := nullif(v_object ->> 'customer', '');
    v_subscription_id := nullif(v_object ->> 'id', '');

    if v_subscription_id is null then
      return jsonb_build_object(
        'event_id', p_event_id,
        'event_type', v_event_type,
        'projection', 'skipped',
        'reason', 'missing stripe subscription id'
      );
    end if;

    perform pg_advisory_xact_lock(
      hashtext(
        'stripe-subscription-projection:' || v_workspace_id::text || ':' || v_subscription_id
      )::bigint
    );

    if v_customer_id is not null or v_subscription_id is not null then
      update core.operators o
         set subscription_status = 'inactive'
       where (
               (v_customer_id is not null and o.stripe_customer_id = v_customer_id)
            or (v_subscription_id is not null and o.stripe_subscription_id = v_subscription_id)
             )
         and exists (
               select 1
                 from core.memberships m
                where m.operator_id = o.id
                  and m.workspace_id = v_workspace_id
             );

      get diagnostics v_rows_updated = row_count;
    end if;

    select obj.id
      into v_object_id
      from core.objects obj
     where obj.workspace_id = v_workspace_id
       and obj.kernel_class = 'subscription'
       and obj.source_ref = v_subscription_id
     order by obj.acknowledged_at desc, obj.created_at desc
     limit 1;

    if v_object_id is null then
      return jsonb_strip_nulls(jsonb_build_object(
        'event_id', p_event_id,
        'event_type', v_event_type,
        'projection', 'skipped',
        'rows_updated', v_rows_updated,
        'reason', 'no canonical subscription object found'
      ));
    end if;

    update core.objects
       set status = 'terminal_resolution_recorded',
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
             'last_subscription_event', v_event_type,
             'last_subscription_event_id', p_event_id::text,
             'stripe_event_id', v_stripe_event_id,
             'stripe_type', v_event_type,
             'stripe_subscription_id', v_subscription_id,
             'stripe_customer_id', v_customer_id,
             'subscription_status', 'inactive',
             'terminal_reason_code', 'subscription_deleted'
           ))
     where id = v_object_id;

    select *
      into v_obligation
      from core.obligations o
     where o.workspace_id = v_workspace_id
       and o.object_id = v_object_id
       and o.obligation_type = 'operationalize_subscription'
     order by case when o.state != 'resolved' then 0 else 1 end, o.opened_at desc
     limit 1;

    if v_obligation.id is not null and v_obligation.state != 'resolved' then
      update core.obligations
         set state = 'resolved',
             terminal_action = 'terminated',
             terminal_reason_code = 'subscription_deleted',
             resolved_at = v_now,
             resolved_by_actor_class = 'system',
             resolved_by_actor_id = v_actor_id,
             closed_at = v_now,
             metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
               'status', 'terminated',
               'block_state', 'terminated',
               'subscription_status', 'inactive',
               'why', 'Stripe subscription was deleted before subscription operationalization completed.',
               'last_subscription_event', v_event_type,
               'last_subscription_event_id', p_event_id::text,
               'stripe_event_id', v_stripe_event_id,
               'stripe_type', v_event_type,
               'stripe_subscription_id', v_subscription_id,
               'stripe_customer_id', v_customer_id,
               'closed_at', v_now,
               'terminal_reason_code', 'subscription_deleted'
             ))
       where id = v_obligation.id;

      select e.event_id
        into v_close_event_id
        from api.append_event(
          v_workspace_id,
          'obligation:' || v_obligation.id::text,
          'obligation.resolved',
          jsonb_strip_nulls(jsonb_build_object(
            'obligation_id', v_obligation.id,
            'object_id', v_object_id,
            'terminal_action', 'terminated',
            'reason_code', 'subscription_deleted',
            'resolution_state', 'canceled',
            'resolved_at', v_now,
            'actor_class', 'system',
            'actor_id', v_actor_id,
            'source_event_id', p_event_id,
            'stripe_event_id', v_stripe_event_id,
            'stripe_customer_id', v_customer_id,
            'stripe_subscription_id', v_subscription_id,
            'metadata', jsonb_strip_nulls(jsonb_build_object(
              'surface', 'stripe_webhook',
              'origin', 'stripe_subscription_deleted'
            ))
          )),
          'stripe:operationalize_subscription:resolve:' || coalesce(v_stripe_event_id, p_event_id::text)
        ) e;

      select r.receipt_id
        into v_close_receipt_id
        from api.emit_receipt(
          v_workspace_id,
          v_close_event_id,
          'obligation:' || v_obligation.id::text,
          'commit',
          jsonb_strip_nulls(jsonb_build_object(
            'obligation_id', v_obligation.id,
            'object_id', v_object_id,
            'terminal_action', 'terminated',
            'reason_code', 'subscription_deleted',
            'resolution_state', 'canceled',
            'resolved_at', v_now,
            'actor_class', 'system',
            'actor_id', v_actor_id,
            'source_event_id', p_event_id,
            'stripe_event_id', v_stripe_event_id,
            'stripe_customer_id', v_customer_id,
            'stripe_subscription_id', v_subscription_id,
            'proof_ref', coalesce(v_stripe_event_id, p_event_id::text),
            'occurred_at', v_now,
            'recorded_at', v_now
          )),
          'stripe:operationalize_subscription:resolve-receipt:' || coalesce(v_stripe_event_id, p_event_id::text)
        ) r;
    elsif v_obligation.id is not null then
      update core.obligations
         set closed_at = coalesce(closed_at, v_now),
             metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
               'subscription_status', 'inactive',
               'last_subscription_event', v_event_type,
               'last_subscription_event_id', p_event_id::text,
               'stripe_event_id', v_stripe_event_id,
               'stripe_type', v_event_type,
               'stripe_subscription_id', v_subscription_id,
               'stripe_customer_id', v_customer_id,
               'terminal_reason_code', coalesce(terminal_reason_code, 'subscription_deleted')
             ))
       where id = v_obligation.id;
    end if;

    return jsonb_strip_nulls(jsonb_build_object(
      'event_id', p_event_id,
      'event_type', v_event_type,
      'projection', 'updated',
      'rows_updated', v_rows_updated,
      'object_id', v_object_id,
      'obligation_id', v_obligation.id,
      'obligation_close_event_id', v_close_event_id,
      'obligation_close_receipt_id', v_close_receipt_id
    ));
  end if;

  return jsonb_build_object(
    'event_id', p_event_id,
    'event_type', v_event_type,
    'projection', 'skipped'
  );
end;
$function$;

create or replace function api.rebuild_operator_subscription_projection(
  p_workspace_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
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
  touched_subscription_ids as (
    select distinct coalesce(
      nullif(payload #>> '{data,object,subscription}', ''),
      nullif(payload #>> '{data,object,id}', '')
    ) as stripe_subscription_id
      from relevant_events
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
        or o.stripe_subscription_id in (
             select stripe_subscription_id
               from touched_subscription_ids
              where stripe_subscription_id is not null
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
$function$;

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
    'operationalize_subscription',
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
      'operationalize_subscription',
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
    'stripe.checkout.session.completed',
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

comment on view core.v_stripe_first_wedge_integrity_summary is
  'Stripe first-wedge integrity summary. Counts supported billing-wedge obligations, receipts, and ingress movements including subscription operationalization.';

commit;
