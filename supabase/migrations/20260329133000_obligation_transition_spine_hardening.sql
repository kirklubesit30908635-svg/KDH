begin;

insert into core.reason_codes (code, category) values
  ('obligation_created', 'system')
on conflict (code) do nothing;

create or replace function api.record_obligation_transition(
  p_obligation_id  uuid,
  p_next_state     text,
  p_actor_class    text,
  p_actor_id       text,
  p_reason_code    text  default null,
  p_payload        jsonb default '{}'::jsonb,
  p_terminal_action text default null,
  p_initial_state  text  default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_obligation               core.obligations%rowtype;
  v_previous_transition      core.obligation_transition_events%rowtype;
  v_current_state            text;
  v_reason_code              text;
  v_terminal_action          text;
  v_event_type               text;
  v_receipt_type             text;
  v_idempotency_key          text;
  v_event_idempotency_key    text;
  v_receipt_idempotency_key  text;
  v_prev_transition_hash     text;
  v_transition_hash          text;
  v_transition_id            uuid;
  v_transition_payload       jsonb := coalesce(p_payload, '{}'::jsonb);
  v_metadata_patch           jsonb := '{}'::jsonb;
  v_event                    record;
  v_receipt                  record;
  v_transition               record;
  v_transition_at            timestamptz := now();
  v_is_seed_transition       boolean := false;
begin
  select *
    into v_obligation
    from core.obligations
   where id = p_obligation_id
   for update;

  if v_obligation.id is null then
    raise exception 'obligation % not found', p_obligation_id
      using errcode = 'no_data_found';
  end if;

  if auth.uid() is not null then
    perform core.assert_member(v_obligation.workspace_id);
  end if;

  select *
    into v_previous_transition
    from core.obligation_transition_events
   where obligation_id = p_obligation_id
   order by created_at desc, id desc
   limit 1;

  v_current_state := api.current_obligation_transition_state(p_obligation_id);

  if v_current_state is null then
    if p_next_state = 'created' then
      v_current_state := 'created';
      v_is_seed_transition := true;
    elsif p_initial_state is null then
      raise exception 'missing initial state for unseeded obligation %', p_obligation_id
        using errcode = 'invalid_parameter_value';
    else
      v_current_state := p_initial_state;
      v_transition_payload := v_transition_payload || jsonb_build_object('legacy_seed', true);
    end if;
  end if;

  if not (
    v_is_seed_transition or
    (v_current_state = 'created' and p_next_state = 'in_progress') or
    (v_current_state = 'in_progress' and p_next_state in ('pending_proof', 'pending_payment', 'closed_no_revenue')) or
    (v_current_state = 'pending_proof' and p_next_state in ('pending_payment', 'closed_no_revenue')) or
    (v_current_state = 'pending_payment' and p_next_state = 'closed_revenue')
  ) then
    raise exception 'invalid transition: % -> %', v_current_state, p_next_state
      using errcode = 'invalid_parameter_value';
  end if;

  if p_next_state = 'closed_revenue'
     and coalesce(v_transition_payload ->> 'payment_intent_id', '') = ''
  then
    raise exception 'payment confirmation required for closed_revenue'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_next_state = 'closed_no_revenue'
     and (
       coalesce(v_transition_payload ->> 'operator_id', '') = ''
       or coalesce(v_transition_payload ->> 'reason', '') = ''
     )
  then
    raise exception 'operator evidence required for closed_no_revenue'
      using errcode = 'invalid_parameter_value';
  end if;

  v_reason_code := coalesce(
    p_reason_code,
    case when p_next_state = 'created' then 'obligation_created' else 'action_completed' end
  );

  if not exists (
    select 1
      from core.reason_codes
     where code = v_reason_code
       and is_active = true
  ) then
    raise exception 'invalid reason_code: %', v_reason_code
      using errcode = 'invalid_parameter_value';
  end if;

  v_terminal_action := coalesce(
    p_terminal_action,
    case
      when p_next_state in ('closed_revenue', 'closed_no_revenue') then 'closed'
      else null
    end
  );

  if v_terminal_action is not null
     and v_terminal_action not in ('closed', 'terminated', 'eliminated')
  then
    raise exception 'invalid terminal_action: %', v_terminal_action
      using errcode = 'invalid_parameter_value';
  end if;

  v_idempotency_key := ledger.sha256_hex(
    p_obligation_id::text || '|' || p_next_state || '|' || v_transition_payload::text
  );

  select
    ote.id,
    ote.current_state,
    ote.next_state,
    ote.idempotency_key,
    ote.transition_hash,
    ote.created_at,
    e.id as ledger_event_id,
    e.seq as event_seq,
    e.hash as event_hash,
    r.id as receipt_id,
    r.seq as receipt_seq,
    r.hash as receipt_hash
    into v_transition
    from core.obligation_transition_events ote
    join ledger.events e
      on e.id = ote.ledger_event_id
    join ledger.receipts r
      on r.id = ote.receipt_id
   where ote.workspace_id = v_obligation.workspace_id
     and ote.idempotency_key = v_idempotency_key
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'transition_id', v_transition.id,
      'obligation_id', p_obligation_id,
      'current_state', v_transition.current_state,
      'next_state', v_transition.next_state,
      'idempotency_key', v_idempotency_key,
      'transition_hash', v_transition.transition_hash,
      'ledger_event_id', v_transition.ledger_event_id,
      'receipt_id', v_transition.receipt_id,
      'event_seq', v_transition.event_seq,
      'event_hash', v_transition.event_hash,
      'receipt_seq', v_transition.receipt_seq,
      'receipt_hash', v_transition.receipt_hash,
      'resolved_at', v_obligation.resolved_at,
      'terminal_action', v_obligation.terminal_action,
      'reason_code', v_obligation.terminal_reason_code
    );
  end if;

  if v_obligation.state = 'resolved' then
    raise exception 'obligation % is already resolved', p_obligation_id
      using errcode = 'invalid_parameter_value';
  end if;

  v_prev_transition_hash := v_previous_transition.transition_hash;
  v_transition_hash := ledger.sha256_hex(
    coalesce(v_prev_transition_hash, '') || '|' ||
    p_obligation_id::text || '|' ||
    v_current_state || '|' ||
    p_next_state || '|' ||
    v_transition_payload::text
  );

  v_event_type := case
    when p_next_state in ('closed_revenue', 'closed_no_revenue') then 'obligation.resolved'
    else 'obligation.transitioned'
  end;

  v_receipt_type := case
    when p_next_state in ('closed_revenue', 'closed_no_revenue') then 'obligation_proof'
    else 'obligation_transition_proof'
  end;

  v_event_idempotency_key := 'obligation.transition.event:' || v_idempotency_key;
  v_receipt_idempotency_key := 'obligation.transition.receipt:' || v_idempotency_key;

  select *
    into v_event
    from api.append_event(
      v_obligation.workspace_id,
      'obligation:' || p_obligation_id::text,
      v_event_type,
      jsonb_build_object(
        'obligation_id', p_obligation_id,
        'object_id', v_obligation.object_id,
        'current_state', v_current_state,
        'next_state', p_next_state,
        'actor_class', p_actor_class,
        'actor_id', p_actor_id,
        'reason_code', v_reason_code,
        'terminal_action', v_terminal_action,
        'transition_hash', v_transition_hash,
        'payload', v_transition_payload
      ),
      v_event_idempotency_key
    );

  if v_event.event_id is null then
    raise exception 'failed to persist transition event for obligation %', p_obligation_id;
  end if;

  select *
    into v_receipt
    from api.emit_receipt(
      v_obligation.workspace_id,
      v_event.event_id,
      'obligation:' || p_obligation_id::text,
      v_receipt_type,
      jsonb_build_object(
        'obligation_id', p_obligation_id,
        'current_state', v_current_state,
        'next_state', p_next_state,
        'actor_class', p_actor_class,
        'actor_id', p_actor_id,
        'reason_code', v_reason_code,
        'terminal_action', v_terminal_action,
        'transition_hash', v_transition_hash,
        'payload', v_transition_payload
      ),
      v_receipt_idempotency_key
    );

  if v_receipt.receipt_id is null then
    raise exception 'failed to persist transition receipt for obligation %', p_obligation_id;
  end if;

  insert into core.obligation_transition_events (
    workspace_id,
    obligation_id,
    ledger_event_id,
    receipt_id,
    current_state,
    next_state,
    actor_class,
    actor_id,
    reason_code,
    payload,
    idempotency_key,
    prev_transition_hash,
    transition_hash
  ) values (
    v_obligation.workspace_id,
    p_obligation_id,
    v_event.event_id,
    v_receipt.receipt_id,
    v_current_state,
    p_next_state,
    p_actor_class,
    p_actor_id,
    v_reason_code,
    v_transition_payload,
    v_idempotency_key,
    v_prev_transition_hash,
    v_transition_hash
  )
  returning id into v_transition_id;

  if jsonb_typeof(v_transition_payload -> 'metadata') = 'object' then
    v_metadata_patch := v_transition_payload -> 'metadata';
  end if;

  v_metadata_patch := v_metadata_patch || jsonb_build_object(
    'transition_state', p_next_state,
    'last_transition_hash', v_transition_hash,
    'last_transition_event_id', v_event.event_id,
    'last_transition_receipt_id', v_receipt.receipt_id,
    'last_transition_at', v_transition_at
  );

  if p_next_state in ('closed_revenue', 'closed_no_revenue') then
    update core.obligations
       set state                   = 'resolved',
           terminal_action         = v_terminal_action,
           terminal_reason_code    = v_reason_code,
           resolved_at             = coalesce(resolved_at, v_transition_at),
           resolved_by_actor_class = p_actor_class,
           resolved_by_actor_id    = p_actor_id,
           receipt_id              = coalesce(receipt_id, v_receipt.receipt_id),
           proof_state             = 'linked',
           proof_strength          = 'kernel_receipt',
           linked_at               = coalesce(linked_at, v_transition_at),
           last_transition_at      = v_transition_at,
           metadata                = coalesce(metadata, '{}'::jsonb) || v_metadata_patch
     where id = p_obligation_id;
  else
    update core.obligations
       set last_transition_at = v_transition_at,
           metadata           = coalesce(metadata, '{}'::jsonb) || v_metadata_patch
     where id = p_obligation_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'transition_id', v_transition_id,
    'obligation_id', p_obligation_id,
    'current_state', v_current_state,
    'next_state', p_next_state,
    'idempotency_key', v_idempotency_key,
    'transition_hash', v_transition_hash,
    'ledger_event_id', v_event.event_id,
    'receipt_id', v_receipt.receipt_id,
    'event_seq', v_event.seq,
    'event_hash', v_event.hash,
    'receipt_seq', v_receipt.seq,
    'receipt_hash', v_receipt.hash,
    'resolved_at', case when p_next_state in ('closed_revenue', 'closed_no_revenue') then v_transition_at else null end,
    'terminal_action', v_terminal_action,
    'reason_code', v_reason_code
  );
end;
$$;

create or replace function api.open_obligation(
  p_workspace_id    uuid,
  p_object_id       uuid,
  p_obligation_type text,
  p_actor_class     text,
  p_actor_id        text,
  p_metadata        jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_obligation_id uuid;
begin
  perform core.assert_member(p_workspace_id);

  if not exists (
    select 1
      from core.objects
     where id = p_object_id
       and workspace_id = p_workspace_id
  ) then
    raise exception 'object % not found in workspace %', p_object_id, p_workspace_id;
  end if;

  insert into core.obligations(
    workspace_id,
    object_id,
    obligation_type,
    opened_by_actor_class,
    opened_by_actor_id,
    metadata
  ) values (
    p_workspace_id,
    p_object_id,
    p_obligation_type,
    p_actor_class,
    p_actor_id,
    p_metadata
  )
  returning id into v_obligation_id;

  perform api.record_obligation_transition(
    p_obligation_id   := v_obligation_id,
    p_next_state      := 'created',
    p_actor_class     := p_actor_class,
    p_actor_id        := p_actor_id,
    p_reason_code     := 'obligation_created',
    p_payload         := jsonb_build_object(
      'source', 'obligation_created',
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    )
  );

  return v_obligation_id;
end;
$$;

create or replace function api.open_subscription_obligation(
  p_provider_account_id    text,
  p_stripe_event_id        text,
  p_stripe_subscription_id text,
  p_stripe_customer_id     text,
  p_livemode               boolean default false,
  p_metadata               jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_conn            core.provider_connections%rowtype;
  v_idempotency_key text;
  v_economic_ref_id uuid;
  v_object_id       uuid;
  v_obligation_id   uuid;
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

  v_idempotency_key := 'operationalize_subscription:' || p_stripe_event_id;

  select id into v_obligation_id
    from core.obligations
   where workspace_id    = v_conn.workspace_id
     and idempotency_key = v_idempotency_key;

  if found then
    return v_obligation_id;
  end if;

  v_economic_ref_id := api.resolve_economic_ref(
    p_workspace_id    := v_conn.workspace_id,
    p_ref_type        := 'subscription',
    p_ref_key         := p_stripe_subscription_id,
    p_external_system := 'stripe',
    p_external_id     := p_stripe_subscription_id,
    p_customer_key    := p_stripe_customer_id,
    p_metadata        := jsonb_build_object(
      'stripe_event_id',     p_stripe_event_id,
      'stripe_customer_id',  p_stripe_customer_id,
      'provider_account_id', p_provider_account_id
    ) || p_metadata
  );

  insert into core.objects (
    workspace_id, kernel_class, economic_posture,
    acknowledged_by_actor_class, acknowledged_by_actor_id,
    source_ref, metadata
  ) values (
    v_conn.workspace_id, 'subscription', 'direct_revenue',
    'system', 'stripe:' || p_provider_account_id,
    p_stripe_subscription_id,
    jsonb_build_object(
      'stripe_subscription_id', p_stripe_subscription_id,
      'stripe_customer_id',     p_stripe_customer_id,
      'provider_account_id',    p_provider_account_id,
      'stripe_event_id',        p_stripe_event_id
    ) || p_metadata
  )
  on conflict (workspace_id, kernel_class, source_ref)
  do update set
    metadata = core.objects.metadata || excluded.metadata
  returning id into v_object_id;

  if v_object_id is null then
    select id into v_object_id
      from core.objects
     where workspace_id = v_conn.workspace_id
       and kernel_class = 'subscription'
       and source_ref   = p_stripe_subscription_id;
  end if;

  insert into core.obligations (
    workspace_id, object_id, obligation_type,
    opened_by_actor_class, opened_by_actor_id,
    idempotency_key, economic_ref_id, metadata
  ) values (
    v_conn.workspace_id, v_object_id, 'operationalize_subscription',
    'system', 'stripe:' || p_provider_account_id,
    v_idempotency_key, v_economic_ref_id,
    jsonb_build_object(
      'stripe_event_id',        p_stripe_event_id,
      'stripe_subscription_id', p_stripe_subscription_id,
      'stripe_customer_id',     p_stripe_customer_id,
      'provider_account_id',    p_provider_account_id,
      'face',                   'billing',
      'severity',               'due_today',
      'surface',                'stripe_webhook'
    ) || p_metadata
  )
  on conflict (workspace_id, idempotency_key)
  do nothing
  returning id into v_obligation_id;

  if v_obligation_id is null then
    select id into v_obligation_id
      from core.obligations
     where workspace_id    = v_conn.workspace_id
       and idempotency_key = v_idempotency_key;

    return v_obligation_id;
  end if;

  perform api.record_obligation_transition(
    p_obligation_id   := v_obligation_id,
    p_next_state      := 'created',
    p_actor_class     := 'system',
    p_actor_id        := 'stripe:' || p_provider_account_id,
    p_reason_code     := 'obligation_created',
    p_payload         := jsonb_build_object(
      'source', 'open_subscription_obligation',
      'metadata', jsonb_build_object(
        'stripe_event_id',        p_stripe_event_id,
        'stripe_subscription_id', p_stripe_subscription_id,
        'stripe_customer_id',     p_stripe_customer_id,
        'provider_account_id',    p_provider_account_id
      ) || coalesce(p_metadata, '{}'::jsonb)
    )
  );

  return v_obligation_id;
end;
$$;

create or replace function api.provision_account_workspace(
  p_stripe_customer_id text,
  p_email              text,
  p_subscription_id    text default null,
  p_customer_name      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = core, registry, ledger, api, public
as $$
declare
  v_existing        registry.billing_account_bindings%rowtype;
  v_tenant_id       uuid;
  v_workspace_id    uuid;
  v_operator_id     uuid;
  v_membership_id   uuid;
  v_object_id       uuid;
  v_obligation_id   uuid;
  v_event_id        uuid;
  v_receipt_id      uuid;
  v_display_name    text;
  v_slug            text;
  v_event_type_id   int;
  v_receipt_type_id int;
  v_chain_key       text;
  v_idempotency_key text;
begin
  select * into v_existing
    from registry.billing_account_bindings
   where stripe_customer_id = p_stripe_customer_id;

  if found then
    return jsonb_build_object(
      'ok',           true,
      'action',       'already_provisioned',
      'tenant_id',    v_existing.tenant_id,
      'workspace_id', v_existing.workspace_id,
      'email',        v_existing.email
    );
  end if;

  select id into v_event_type_id
    from registry.event_types
   where name = 'workspace.provisioned';

  select id into v_receipt_type_id
    from registry.receipt_types
   where name = 'provisioning';

  if v_event_type_id is null or v_receipt_type_id is null then
    raise exception 'Registry entries for workspace.provisioned / provisioning not found.';
  end if;

  v_display_name := coalesce(
    nullif(p_customer_name, ''),
    split_part(p_email, '@', 1)
  );

  v_slug := left(
    regexp_replace(lower(v_display_name), '[^a-z0-9]+', '-', 'g'),
    48
  );
  v_slug := v_slug || '-' || left(gen_random_uuid()::text, 6);

  insert into core.tenants (name, slug)
  values (v_display_name, v_slug)
  returning id into v_tenant_id;

  insert into core.workspaces (tenant_id, name, slug)
  values (
    v_tenant_id,
    v_display_name || ' Operations',
    v_slug || '-ops'
  )
  returning id into v_workspace_id;

  select o.id into v_operator_id
    from core.operators o
    join auth.users u on u.id = o.auth_uid
   where u.email = p_email
   limit 1;

  if v_operator_id is not null then
    insert into core.memberships (operator_id, workspace_id, role)
    values (v_operator_id, v_workspace_id, 'owner')
    on conflict (operator_id, workspace_id) do nothing
    returning id into v_membership_id;
  end if;

  insert into registry.billing_account_bindings (
    stripe_customer_id, tenant_id, workspace_id,
    email, subscription_id
  ) values (
    p_stripe_customer_id, v_tenant_id, v_workspace_id,
    p_email, p_subscription_id
  );

  insert into core.objects (
    workspace_id, kernel_class, economic_posture,
    acknowledged_by_actor_class, acknowledged_by_actor_id,
    source_ref, metadata
  ) values (
    v_workspace_id,
    'subscription',
    'direct_revenue',
    'system',
    'activation:' || p_stripe_customer_id,
    p_subscription_id,
    jsonb_build_object(
      'billing_account_id', p_stripe_customer_id,
      'email',              p_email,
      'subscription_id',    p_subscription_id,
      'activated_at',       now()
    )
  )
  on conflict (workspace_id, kernel_class, source_ref)
    where source_ref is not null
  do update set
    metadata = core.objects.metadata || excluded.metadata
  returning id into v_object_id;

  if v_object_id is null then
    select id into v_object_id
      from core.objects
     where workspace_id = v_workspace_id
       and kernel_class = 'subscription'
       and source_ref   = p_subscription_id;
  end if;

  v_idempotency_key := 'activation:' || p_stripe_customer_id;

  insert into core.obligations (
    workspace_id,
    object_id,
    obligation_type,
    opened_by_actor_class,
    opened_by_actor_id,
    due_at,
    metadata
  ) values (
    v_workspace_id,
    v_object_id,
    'operationalize_subscription',
    'system',
    'activation-pipeline',
    now() + interval '24 hours',
    jsonb_build_object(
      'billing_account_id', p_stripe_customer_id,
      'email',              p_email,
      'subscription_id',    p_subscription_id,
      'tenant_id',          v_tenant_id,
      'workspace_id',       v_workspace_id,
      'activated_at',       now(),
      'face',               'billing',
      'severity',           'due_today',
      'surface',            'activation_pipeline'
    )
  )
  returning id into v_obligation_id;

  perform api.record_obligation_transition(
    p_obligation_id   := v_obligation_id,
    p_next_state      := 'created',
    p_actor_class     := 'system',
    p_actor_id        := 'activation:' || p_stripe_customer_id,
    p_reason_code     := 'obligation_created',
    p_payload         := jsonb_build_object(
      'source', 'provision_account_workspace',
      'metadata', jsonb_build_object(
        'billing_account_id', p_stripe_customer_id,
        'email',              p_email,
        'subscription_id',    p_subscription_id,
        'tenant_id',          v_tenant_id,
        'workspace_id',       v_workspace_id
      )
    )
  );

  v_chain_key := 'activation:' || v_workspace_id::text;

  insert into ledger.events (
    workspace_id,
    chain_key,
    event_type_id,
    payload,
    idempotency_key,
    seq, prev_hash, hash
  ) values (
    v_workspace_id,
    v_chain_key,
    v_event_type_id,
    jsonb_build_object(
      'action',              'workspace_provisioned',
      'billing_account_id',  p_stripe_customer_id,
      'email',               p_email,
      'subscription_id',     p_subscription_id,
      'tenant_id',           v_tenant_id,
      'workspace_id',        v_workspace_id,
      'obligation_id',       v_obligation_id
    ),
    v_idempotency_key,
    0, 'GENESIS', 'PENDING'
  )
  returning id into v_event_id;

  insert into ledger.receipts (
    workspace_id,
    event_id,
    receipt_type_id,
    chain_key,
    payload,
    seq, prev_hash, hash
  ) values (
    v_workspace_id,
    v_event_id,
    v_receipt_type_id,
    'obligation:' || v_obligation_id::text,
    jsonb_build_object(
      'action',              'workspace_provisioned',
      'billing_account_id',  p_stripe_customer_id,
      'email',               p_email,
      'tenant_id',           v_tenant_id,
      'workspace_id',        v_workspace_id,
      'obligation_id',       v_obligation_id
    ),
    0, 'GENESIS', 'PENDING'
  )
  returning id into v_receipt_id;

  update core.obligations
     set receipt_id     = v_receipt_id,
         proof_state    = 'linked',
         proof_strength = 'kernel_receipt',
         linked_at      = now(),
         proof_note     = 'Activation receipt auto-linked'
   where id = v_obligation_id;

  return jsonb_build_object(
    'ok',             true,
    'action',         'provisioned',
    'tenant_id',      v_tenant_id,
    'workspace_id',   v_workspace_id,
    'membership_id',  v_membership_id,
    'object_id',      v_object_id,
    'obligation_id',  v_obligation_id,
    'event_id',       v_event_id,
    'receipt_id',     v_receipt_id,
    'email',          p_email,
    'slug',           v_slug
  );
end;
$$;

revoke all on function api.append_event(uuid, text, text, jsonb, text)
  from public, anon, authenticated, service_role;

revoke all on function api.emit_receipt(uuid, uuid, text, text, jsonb, text)
  from public, anon, authenticated, service_role;

grant execute on function api.record_obligation_transition(uuid, text, text, text, text, jsonb, text, text)
  to authenticated, service_role;

grant execute on function api.command_resolve_obligation(uuid, text, text, text, jsonb)
  to authenticated;

commit;
