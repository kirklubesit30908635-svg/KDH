begin;

create or replace function core.request_role_name()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.role(), ''),
    nullif(auth.jwt() ->> 'role', ''),
    ''
  )
$$;

comment on function core.request_role_name() is
  'Resolves the effective request role across JWT claim sources so machine callers can bypass human membership checks safely.';

create or replace function api.append_event(
  p_workspace_id    uuid,
  p_chain_key       text,
  p_event_type      text,
  p_payload         jsonb default '{}',
  p_idempotency_key text  default null
)
returns table (
  event_id uuid,
  seq      bigint,
  hash     text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_type_id  int;
  v_event_id uuid;
  v_seq      bigint;
  v_hash     text;
begin
  if auth.uid() is not null
     and core.request_role_name() not in ('service_role', 'supabase_admin')
  then
    perform core.assert_member(p_workspace_id);
  end if;

  select id into v_type_id
    from registry.event_types
   where name = p_event_type;
  if v_type_id is null then
    raise exception 'unknown event_type: %', p_event_type
      using errcode = 'invalid_parameter_value';
  end if;

  insert into ledger.events (
    workspace_id, chain_key, event_type_id, payload,
    idempotency_key, seq, prev_hash, hash
  ) values (
    p_workspace_id, p_chain_key, v_type_id, p_payload,
    p_idempotency_key, 0, 'GENESIS', 'PENDING'
  )
  returning id, events.seq, events.hash
    into v_event_id, v_seq, v_hash;

  if v_event_id is null and p_idempotency_key is not null then
    select id, events.seq, events.hash
      into v_event_id, v_seq, v_hash
      from ledger.events as events
     where idempotency_key = p_idempotency_key
       and workspace_id    = p_workspace_id;
  end if;

  return query select v_event_id, v_seq, v_hash;
end;
$$;

create or replace function api.emit_receipt(
  p_workspace_id    uuid,
  p_event_id        uuid,
  p_chain_key       text,
  p_receipt_type    text,
  p_payload         jsonb default '{}',
  p_idempotency_key text  default null
)
returns table (
  receipt_id uuid,
  seq        bigint,
  hash       text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_type_id    int;
  v_receipt_id uuid;
  v_seq        bigint;
  v_hash       text;
begin
  if auth.uid() is not null
     and core.request_role_name() not in ('service_role', 'supabase_admin')
  then
    perform core.assert_member(p_workspace_id);
  end if;

  select id into v_type_id
    from registry.receipt_types
   where name = p_receipt_type;
  if v_type_id is null then
    raise exception 'unknown receipt_type: %', p_receipt_type
      using errcode = 'invalid_parameter_value';
  end if;

  insert into ledger.receipts (
    workspace_id, event_id, receipt_type_id, chain_key,
    payload, idempotency_key, seq, prev_hash, hash
  ) values (
    p_workspace_id, p_event_id, v_type_id, p_chain_key,
    p_payload, p_idempotency_key, 0, 'GENESIS', 'PENDING'
  )
  returning id, receipts.seq, receipts.hash
    into v_receipt_id, v_seq, v_hash;

  if v_receipt_id is null and p_idempotency_key is not null then
    select id, receipts.seq, receipts.hash
      into v_receipt_id, v_seq, v_hash
      from ledger.receipts as receipts
     where idempotency_key = p_idempotency_key
       and workspace_id    = p_workspace_id;
  end if;

  return query select v_receipt_id, v_seq, v_hash;
end;
$$;

create or replace function api.ingest_stripe_event(
  p_provider_account_id text,
  p_stripe_event_id     text,
  p_stripe_type         text,
  p_livemode            boolean,
  p_api_version         text        default null,
  p_stripe_created_at   timestamptz default now(),
  p_payload             jsonb       default '{}'
)
returns table (
  event_id   uuid,
  receipt_id uuid,
  seq        bigint,
  hash       text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
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

  if auth.uid() is not null
     and core.request_role_name() not in ('service_role', 'supabase_admin')
  then
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
      )
    ) r;

  return query select v_event_id, v_receipt_id, v_seq, v_hash;
end;
$$;

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

  if auth.uid() is not null
     and core.request_role_name() not in ('service_role', 'supabase_admin')
  then
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

comment on function api.record_obligation_transition(uuid, text, text, text, text, jsonb, text, text) is
  'Governed obligation transition write with replay-safe idempotency lookup before transition validation.';

commit;
