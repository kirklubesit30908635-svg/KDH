begin;

insert into registry.event_types (family, name, description) values
  ('obligation', 'obligation.transitioned', 'Obligation transition committed through the governed transition spine')
on conflict (name) do nothing;

insert into registry.receipt_types (name, description) values
  ('obligation_transition_proof', 'Proof of a governed obligation transition committed to the ledger')
on conflict (name) do nothing;

create table if not exists core.obligation_transition_events (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid        not null references core.workspaces(id),
  obligation_id        uuid        not null references core.obligations(id) on delete cascade,
  ledger_event_id      uuid        not null references ledger.events(id),
  receipt_id           uuid        not null references ledger.receipts(id),
  current_state        text        not null,
  next_state           text        not null,
  actor_class          text        not null,
  actor_id             text        not null,
  reason_code          text,
  payload              jsonb       not null default '{}'::jsonb,
  idempotency_key      text        not null,
  prev_transition_hash text,
  transition_hash      text        not null,
  created_at           timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  unique (ledger_event_id),
  unique (receipt_id),
  constraint obligation_transition_current_state_check
    check (current_state in (
      'created',
      'in_progress',
      'pending_proof',
      'pending_payment',
      'closed_revenue',
      'closed_no_revenue'
    )),
  constraint obligation_transition_next_state_check
    check (next_state in (
      'created',
      'in_progress',
      'pending_proof',
      'pending_payment',
      'closed_revenue',
      'closed_no_revenue'
    ))
);

create index if not exists idx_obligation_transition_events_obligation_created
  on core.obligation_transition_events (obligation_id, created_at desc, id desc);

comment on table core.obligation_transition_events is
  'DB-backed obligation transition event spine. One row per governed transition, linked to canonical ledger event and receipt rows.';

create or replace function api.current_obligation_transition_state(
  p_obligation_id uuid
)
returns text
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $$
  select ote.next_state
    from core.obligation_transition_events ote
   where ote.obligation_id = p_obligation_id
   order by ote.created_at desc, ote.id desc
   limit 1
$$;

grant execute on function api.current_obligation_transition_state(uuid)
  to authenticated, service_role;

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
  v_obligation            core.obligations%rowtype;
  v_previous_transition   core.obligation_transition_events%rowtype;
  v_current_state         text;
  v_reason_code           text;
  v_terminal_action       text;
  v_event_type            text;
  v_receipt_type          text;
  v_idempotency_key       text;
  v_event_idempotency_key text;
  v_receipt_idempotency_key text;
  v_prev_transition_hash  text;
  v_transition_hash       text;
  v_transition_id         uuid;
  v_transition_payload    jsonb := coalesce(p_payload, '{}'::jsonb);
  v_metadata_patch        jsonb := '{}'::jsonb;
  v_event                 record;
  v_receipt               record;
  v_transition            record;
  v_resolved_at           timestamptz := now();
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

  v_current_state := coalesce(v_previous_transition.next_state, p_initial_state);

  if v_current_state is null then
    raise exception 'obligation % has no persisted transition state; initial state required', p_obligation_id
      using errcode = 'invalid_parameter_value';
  end if;

  if not (
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

  v_reason_code := coalesce(p_reason_code, 'action_completed');

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
    'last_transition_at', v_resolved_at
  );

  if p_next_state in ('closed_revenue', 'closed_no_revenue') then
    update core.obligations
       set state                   = 'resolved',
           terminal_action         = v_terminal_action,
           terminal_reason_code    = v_reason_code,
           resolved_at             = coalesce(resolved_at, v_resolved_at),
           resolved_by_actor_class = p_actor_class,
           resolved_by_actor_id    = p_actor_id,
           receipt_id              = coalesce(receipt_id, v_receipt.receipt_id),
           proof_state             = 'linked',
           proof_strength          = 'kernel_receipt',
           linked_at               = coalesce(linked_at, v_resolved_at),
           last_transition_at      = v_resolved_at,
           metadata                = coalesce(metadata, '{}'::jsonb) || v_metadata_patch
     where id = p_obligation_id;
  else
    update core.obligations
       set last_transition_at = v_resolved_at,
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
    'resolved_at', case when p_next_state in ('closed_revenue', 'closed_no_revenue') then v_resolved_at else null end,
    'terminal_action', v_terminal_action,
    'reason_code', v_reason_code
  );
end;
$$;

grant execute on function api.record_obligation_transition(uuid, text, text, text, text, jsonb, text, text)
  to authenticated, service_role;

create or replace function api.command_resolve_obligation(
  p_obligation_id uuid,
  p_actor_id text,
  p_terminal_action text default 'closed',
  p_reason_code text default 'action_completed',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_obligation core.obligations%rowtype;
  v_result jsonb;
begin
  select *
    into v_obligation
    from core.obligations
   where id = p_obligation_id;

  if v_obligation.id is null then
    raise exception 'obligation % not found', p_obligation_id
      using errcode = 'no_data_found';
  end if;

  perform core.assert_member(v_obligation.workspace_id);

  if p_terminal_action not in ('closed', 'terminated', 'eliminated') then
    raise exception 'invalid terminal_action: %', p_terminal_action
      using errcode = 'invalid_parameter_value';
  end if;

  if not exists (
    select 1
      from core.reason_codes
     where code = p_reason_code
       and is_active = true
  ) then
    raise exception 'invalid reason_code: %', p_reason_code
      using errcode = 'invalid_parameter_value';
  end if;

  select api.record_obligation_transition(
    p_obligation_id   := p_obligation_id,
    p_next_state      := 'closed_no_revenue',
    p_actor_class     := 'human',
    p_actor_id        := p_actor_id,
    p_reason_code     := p_reason_code,
    p_payload         := jsonb_build_object(
      'operator_id', p_actor_id,
      'reason', p_reason_code,
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    ),
    p_terminal_action := p_terminal_action,
    p_initial_state   := coalesce(nullif(p_metadata ->> 'transition_initial_state', ''), 'in_progress')
  ) into v_result;

  return jsonb_build_object(
    'ok', true,
    'obligation_id', v_result ->> 'obligation_id',
    'ledger_event_id', v_result ->> 'ledger_event_id',
    'receipt_id', v_result ->> 'receipt_id',
    'event_seq', (v_result ->> 'event_seq')::bigint,
    'event_hash', v_result ->> 'event_hash',
    'receipt_seq', (v_result ->> 'receipt_seq')::bigint,
    'receipt_hash', v_result ->> 'receipt_hash',
    'resolved_at', v_result ->> 'resolved_at',
    'terminal_action', v_result ->> 'terminal_action',
    'reason_code', v_result ->> 'reason_code'
  );
end;
$$;

grant execute on function api.command_resolve_obligation(uuid, text, text, text, jsonb)
  to authenticated;

commit;
