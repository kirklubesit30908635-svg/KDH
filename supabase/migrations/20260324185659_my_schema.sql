set check_function_bodies = off;

CREATE OR REPLACE FUNCTION api.ingest_stripe_event(p_provider_account_id text, p_stripe_event_id text, p_stripe_type text, p_livemode boolean, p_api_version text DEFAULT NULL::text, p_stripe_created_at timestamp with time zone DEFAULT now(), p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(event_id uuid, receipt_id uuid, seq bigint, hash text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_conn       core.provider_connections%rowtype;
  v_event_id   uuid;
  v_receipt_id uuid;
  v_seq        bigint;
  v_hash       text;
  v_chain_key  text;
begin
  select * into v_conn
    from core.provider_connections
   where provider            = 'stripe'
     and provider_account_id = p_provider_account_id
     and livemode            = p_livemode
     and is_active           = true;

  if not found then
    raise exception
      'no active stripe provider connection for account % (livemode=%)',
      p_provider_account_id, p_livemode
      using errcode = 'invalid_parameter_value';
  end if;

  if auth.uid() is not null then
    perform core.assert_member(v_conn.workspace_id);
  end if;

  if exists (
    select 1
      from ingest.stripe_events
     where provider_connection_id = v_conn.id
       and stripe_event_id        = p_stripe_event_id
  ) then
    select e.id, e.seq, e.hash
      into v_event_id, v_seq, v_hash
      from ledger.events e
     where e.workspace_id    = v_conn.workspace_id
       and e.idempotency_key = p_stripe_event_id;

    select r.id into v_receipt_id
      from ledger.receipts r
     where r.workspace_id = v_conn.workspace_id
       and r.event_id     = v_event_id
     order by r.seq desc
     limit 1;

    if p_stripe_type in (
      'stripe.checkout.session.completed',
      'stripe.customer.subscription.deleted'
    ) and v_event_id is not null then
      perform api.project_operator_subscription_event(v_event_id);
    end if;

    return query select v_event_id, v_receipt_id, v_seq, v_hash;
    return;
  end if;

  if not exists (
    select 1 from registry.event_types where name = p_stripe_type
  ) then
    raise exception 'unknown stripe event type: %', p_stripe_type
      using errcode = 'invalid_parameter_value';
  end if;

  insert into ingest.stripe_events (
    provider_connection_id,
    workspace_id,
    stripe_event_id,
    stripe_type,
    livemode,
    api_version,
    stripe_created_at,
    payload
  ) values (
    v_conn.id,
    v_conn.workspace_id,
    p_stripe_event_id,
    p_stripe_type,
    p_livemode,
    p_api_version,
    p_stripe_created_at,
    p_payload
  );

  v_chain_key := p_stripe_type;

  select e.event_id, e.seq, e.hash
    into v_event_id, v_seq, v_hash
    from api.append_event(
      v_conn.workspace_id,
      v_chain_key,
      p_stripe_type,
      p_payload,
      p_stripe_event_id
    ) e;

  select r.receipt_id
    into v_receipt_id
    from api.emit_receipt(
      v_conn.workspace_id,
      v_event_id,
      v_chain_key,
      'ack',
      jsonb_build_object(
        'stripe_event_id',     p_stripe_event_id,
        'provider_account_id', p_provider_account_id,
        'stripe_type',         p_stripe_type,
        'livemode',            p_livemode
      ),
      'stripe:receipt:' || p_stripe_event_id
    ) r;

  if p_stripe_type in (
    'stripe.checkout.session.completed',
    'stripe.customer.subscription.deleted'
  ) and v_event_id is not null then
    perform api.project_operator_subscription_event(v_event_id);
  end if;

  return query select v_event_id, v_receipt_id, v_seq, v_hash;
end;
$function$
;

CREATE OR REPLACE FUNCTION api.project_operator_subscription_event(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_event_type          text;
  v_workspace_id        uuid;
  v_payload             jsonb;
  v_object              jsonb;
  v_auth_uid_text       text;
  v_customer_id         text;
  v_subscription_id     text;
  v_checkout_session_id text;
  v_invoice_id          text;
  v_payment_status      text;
  v_mode                text;
  v_operator_id         uuid;
  v_object_id           uuid;
  v_obligation_id       uuid;
  v_rows_updated        integer := 0;
  v_due_at              timestamptz := now() + interval '1 hour';
  v_open_event_id       uuid;
  v_open_receipt_id     uuid;
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

    if v_payment_status is distinct from 'paid' then
      return jsonb_build_object(
        'event_id', p_event_id,
        'event_type', v_event_type,
        'projection', 'skipped',
        'reason', 'checkout session is not paid'
      );
    end if;

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
     order by case when v_auth_uid_text is not null and o.auth_uid::text = v_auth_uid_text then 0 else 1 end
     limit 1;

    if v_operator_id is null then
      return jsonb_build_object(
        'event_id', p_event_id,
        'event_type', v_event_type,
        'projection', 'skipped',
        'reason', 'no workspace-bound operator identity found'
      );
    end if;

    update core.operators o
       set stripe_customer_id = coalesce(v_customer_id, o.stripe_customer_id),
           stripe_subscription_id = v_subscription_id,
           subscription_status = 'active'
     where o.id = v_operator_id;

    get diagnostics v_rows_updated = row_count;

    perform pg_advisory_xact_lock(
      hashtext(
        'operator-access-subscription:' || v_workspace_id::text || ':' || v_subscription_id
      )::bigint
    );

    select obj.id
      into v_object_id
      from core.objects obj
     where obj.workspace_id = v_workspace_id
       and obj.kernel_class = 'operator_access_subscription'
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
        'operator_access_subscription',
        'direct_revenue',
        'under_governance',
        'system',
        'stripe_projection',
        v_subscription_id,
        jsonb_strip_nulls(jsonb_build_object(
          'title', 'Activate operator access',
          'why', 'Paid Stripe subscription checkout completed. Access activation must be sealed before the billing wedge is clear.',
          'face', 'billing',
          'surface', 'stripe_webhook',
          'stripe_type', v_event_type,
          'source_ref', v_subscription_id,
          'source_event_id', p_event_id::text,
          'stripe_customer_id', v_customer_id,
          'stripe_subscription_id', v_subscription_id,
          'stripe_invoice_id', v_invoice_id,
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
               'title', 'Activate operator access',
               'why', 'Paid Stripe subscription checkout completed. Access activation must be sealed before the billing wedge is clear.',
               'face', 'billing',
               'surface', 'stripe_webhook',
               'stripe_type', v_event_type,
               'source_ref', v_subscription_id,
               'source_event_id', p_event_id::text,
               'stripe_customer_id', v_customer_id,
               'stripe_subscription_id', v_subscription_id,
               'stripe_invoice_id', v_invoice_id,
               'stripe_checkout_session_id', v_checkout_session_id,
               'operator_auth_uid', v_auth_uid_text,
               'operator_identity_id', v_operator_id::text,
               'economic_ref_type', 'subscription',
               'economic_ref_id', v_subscription_id,
               'subscription_key', v_subscription_id
             ))
       where id = v_object_id;
    end if;

    select o.id
      into v_obligation_id
      from core.obligations o
     where o.workspace_id = v_workspace_id
       and o.object_id = v_object_id
       and o.obligation_type = 'activate_operator_access'
     order by case when o.state != 'resolved' then 0 else 1 end, o.opened_at desc
     limit 1;

    if v_obligation_id is null then
      insert into core.obligations(
        workspace_id,
        object_id,
        obligation_type,
        state,
        opened_by_actor_class,
        opened_by_actor_id,
        metadata
      )
      values (
        v_workspace_id,
        v_object_id,
        'activate_operator_access',
        'open',
        'system',
        'stripe_projection',
        jsonb_strip_nulls(jsonb_build_object(
          'title', 'Activate operator access',
          'why', 'Bind operator identity and seal access activation from the paid Stripe subscription.',
          'face', 'billing',
          'surface', 'stripe_webhook',
          'stripe_type', v_event_type,
          'source_ref', v_subscription_id,
          'source_event_id', p_event_id::text,
          'stripe_customer_id', v_customer_id,
          'stripe_subscription_id', v_subscription_id,
          'stripe_invoice_id', v_invoice_id,
          'stripe_checkout_session_id', v_checkout_session_id,
          'operator_auth_uid', v_auth_uid_text,
          'operator_identity_id', v_operator_id::text,
          'economic_ref_type', 'subscription',
          'economic_ref_id', v_subscription_id,
          'subscription_key', v_subscription_id,
          'action', 'activate_operator_access',
          'severity', 'critical',
          'due_at', v_due_at,
          'return_surface', '/command',
          'resolution_required', 'receipt-backed entitlement activation'
        ))
      )
      returning id into v_obligation_id;

      select e.event_id
        into v_open_event_id
        from api.append_event(
          v_workspace_id,
          'obligation:' || v_obligation_id::text,
          'obligation.created',
          jsonb_strip_nulls(jsonb_build_object(
            'obligation_id', v_obligation_id,
            'object_id', v_object_id,
            'movement_type', 'checkout_session_completed',
            'source_event_id', p_event_id,
            'stripe_customer_id', v_customer_id,
            'stripe_subscription_id', v_subscription_id,
            'stripe_invoice_id', v_invoice_id,
            'operator_identity_id', v_operator_id,
            'required_action', 'activate_operator_access',
            'occurred_at', now(),
            'recorded_at', now()
          )),
          'operator-access-obligation-open:' || v_subscription_id
        ) e;

      select r.receipt_id
        into v_open_receipt_id
        from api.emit_receipt(
          v_workspace_id,
          v_open_event_id,
          'obligation:' || v_obligation_id::text,
          'obligation_opened',
          jsonb_strip_nulls(jsonb_build_object(
            'obligation_id', v_obligation_id,
            'object_id', v_object_id,
            'movement_type', 'checkout_session_completed',
            'source_event_id', p_event_id,
            'stripe_customer_id', v_customer_id,
            'stripe_subscription_id', v_subscription_id,
            'stripe_invoice_id', v_invoice_id,
            'operator_identity_id', v_operator_id,
            'required_action', 'activate_operator_access',
            'occurred_at', now(),
            'recorded_at', now()
          )),
          'operator-access-obligation-open-receipt:' || v_subscription_id
        ) r;
    else
      update core.obligations
         set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'title', 'Activate operator access',
           'why', 'Bind operator identity and seal access activation from the paid Stripe subscription.',
           'face', 'billing',
           'surface', 'stripe_webhook',
           'stripe_type', v_event_type,
           'source_ref', v_subscription_id,
           'source_event_id', p_event_id::text,
           'stripe_customer_id', v_customer_id,
           'stripe_subscription_id', v_subscription_id,
           'stripe_invoice_id', v_invoice_id,
           'stripe_checkout_session_id', v_checkout_session_id,
           'operator_auth_uid', v_auth_uid_text,
           'operator_identity_id', v_operator_id::text,
           'economic_ref_type', 'subscription',
           'economic_ref_id', v_subscription_id,
           'subscription_key', v_subscription_id,
           'action', 'activate_operator_access',
           'severity', 'critical',
           'due_at', v_due_at,
           'return_surface', '/command',
           'resolution_required', 'receipt-backed entitlement activation'
         ))
       where id = v_obligation_id;
    end if;

    return jsonb_strip_nulls(jsonb_build_object(
      'event_id', p_event_id,
      'event_type', v_event_type,
      'projection', 'updated',
      'rows_updated', v_rows_updated,
      'operator_id', v_operator_id,
      'object_id', v_object_id,
      'obligation_id', v_obligation_id,
      'obligation_open_event_id', v_open_event_id,
      'obligation_open_receipt_id', v_open_receipt_id
    ));
  end if;

  if v_event_type = 'stripe.customer.subscription.deleted' then
    v_customer_id := nullif(v_object ->> 'customer', '');
    v_subscription_id := nullif(v_object ->> 'id', '');

    if v_customer_id is not null or v_subscription_id is not null then
      update core.operators o
         set subscription_status = 'inactive'
       where (
               (
                   v_customer_id is not null
               and o.stripe_customer_id = v_customer_id
               )
            or (
                   v_subscription_id is not null
               and o.stripe_subscription_id = v_subscription_id
               )
             )
         and exists (
               select 1
                 from core.memberships m
                where m.operator_id = o.id
                  and m.workspace_id = v_workspace_id
             );

      get diagnostics v_rows_updated = row_count;
    end if;

    if v_subscription_id is not null then
      select obj.id
        into v_object_id
        from core.objects obj
       where obj.workspace_id = v_workspace_id
         and obj.kernel_class = 'operator_access_subscription'
         and obj.source_ref = v_subscription_id
       order by obj.acknowledged_at desc, obj.created_at desc
       limit 1;

      if v_object_id is not null then
        update core.objects
           set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
             'last_subscription_event', v_event_type,
             'last_subscription_event_id', p_event_id::text,
             'subscription_status', 'inactive'
           ))
         where id = v_object_id;

        update core.obligations
           set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
             'status', 'blocked',
             'block_state', 'blocked',
             'subscription_status', 'inactive',
             'why', 'Stripe subscription was deleted before operator access activation was sealed.',
             'last_subscription_event', v_event_type,
             'last_subscription_event_id', p_event_id::text,
             'stripe_subscription_id', v_subscription_id
           ))
         where object_id = v_object_id
           and obligation_type = 'activate_operator_access'
           and state != 'resolved';
      end if;
    end if;

    return jsonb_strip_nulls(jsonb_build_object(
      'event_id', p_event_id,
      'event_type', v_event_type,
      'projection', case when v_rows_updated > 0 then 'updated' else 'skipped' end,
      'rows_updated', v_rows_updated,
      'object_id', v_object_id
    ));
  end if;

  return jsonb_build_object(
    'event_id', p_event_id,
    'event_type', v_event_type,
    'projection', 'skipped'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION api.rebuild_operator_subscription_projection(p_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
$function$
;


