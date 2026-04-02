begin;

insert into registry.event_types (family, name, description)
values (
  'obligation',
  'obligation.watchdog_signal',
  'Watchdog recorded active operator pressure for a live obligation'
)
on conflict (name) do update
set description = excluded.description;

create or replace function api.record_obligation_watchdog_signal(
  p_obligation_id uuid,
  p_signal_kind   text,
  p_actor_id      text default 'system:watchdog',
  p_payload       jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_obligation      core.obligations%rowtype;
  v_existing_event  ledger.events%rowtype;
  v_event_id        uuid;
  v_seq             bigint;
  v_hash            text;
  v_chain_key       text;
  v_idempotency_key text;
begin
  if p_signal_kind not in ('late_obligation', 'at_risk_obligation') then
    raise exception 'unsupported watchdog signal kind: %', p_signal_kind
      using errcode = 'invalid_parameter_value';
  end if;

  select *
    into v_obligation
    from core.obligations
   where id = p_obligation_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'obligation_not_found',
      'obligation_id', p_obligation_id
    );
  end if;

  if auth.uid() is not null
     and core.request_role_name() not in ('service_role', 'supabase_admin')
  then
    perform core.assert_member(v_obligation.workspace_id);
  end if;

  if v_obligation.state = 'resolved' then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'reason', 'resolved',
      'obligation_id', p_obligation_id
    );
  end if;

  v_chain_key := 'obligation:' || p_obligation_id::text;
  v_idempotency_key := format('watchdog:%s:%s', p_obligation_id::text, p_signal_kind);

  select *
    into v_existing_event
    from ledger.events
   where workspace_id = v_obligation.workspace_id
     and idempotency_key = v_idempotency_key
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'obligation_id', p_obligation_id,
      'workspace_id', v_obligation.workspace_id,
      'signal_kind', p_signal_kind,
      'event_id', v_existing_event.id,
      'event_seq', v_existing_event.seq,
      'event_hash', v_existing_event.hash
    );
  end if;

  select event_id, seq, hash
    into v_event_id, v_seq, v_hash
    from api.append_event(
      v_obligation.workspace_id,
      v_chain_key,
      'obligation.watchdog_signal',
      jsonb_build_object(
        'obligation_id', v_obligation.id,
        'object_id', v_obligation.object_id,
        'obligation_type', v_obligation.obligation_type,
        'signal_kind', p_signal_kind,
        'actor_id', p_actor_id,
        'state', v_obligation.state,
        'occurred_at', now()
      ) || coalesce(p_payload, '{}'::jsonb),
      v_idempotency_key
    );

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'obligation_id', p_obligation_id,
    'workspace_id', v_obligation.workspace_id,
    'signal_kind', p_signal_kind,
    'event_id', v_event_id,
    'event_seq', v_seq,
    'event_hash', v_hash
  );
end;
$$;

comment on function api.record_obligation_watchdog_signal(uuid, text, text, jsonb) is
  'Records a typed watchdog signal for a live obligation through the canonical event ledger. No receipt is emitted.';

create or replace function api.run_workspace_watchdog(
  p_workspace_id uuid,
  p_actor_id     text default 'system:watchdog'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_row             record;
  v_result          jsonb;
  v_signal_kind     text;
  v_run_at          timestamptz := now();
  v_evaluated_count integer := 0;
  v_emitted_count   integer := 0;
  v_late_count      integer := 0;
  v_at_risk_count   integer := 0;
  v_proof_lag_count integer := 0;
  v_raw_open_count  integer := 0;
  v_visible_open    integer := 0;
  v_event_ids       uuid[] := '{}';
begin
  if auth.uid() is not null
     and core.request_role_name() not in ('service_role', 'supabase_admin')
  then
    perform core.assert_member(p_workspace_id);
  end if;

  for v_row in
    select
      obligation_id,
      kind,
      title,
      why,
      face,
      severity,
      due_at,
      created_at,
      age_hours,
      is_breach,
      economic_ref_type,
      economic_ref_id,
      location
    from core.v_operator_next_actions
    where workspace_id = p_workspace_id
    order by is_overdue desc, due_at asc nulls last, sort_key desc
  loop
    v_evaluated_count := v_evaluated_count + 1;
    v_visible_open := v_visible_open + 1;

    if coalesce(v_row.is_breach, false) then
      v_signal_kind := 'late_obligation';
      v_late_count := v_late_count + 1;
    elsif v_row.severity in ('critical', 'at_risk') then
      v_signal_kind := 'at_risk_obligation';
      v_at_risk_count := v_at_risk_count + 1;
    else
      continue;
    end if;

    v_result := api.record_obligation_watchdog_signal(
      p_obligation_id := v_row.obligation_id,
      p_signal_kind   := v_signal_kind,
      p_actor_id      := p_actor_id,
      p_payload       := jsonb_build_object(
        'workspace_id', p_workspace_id,
        'obligation_type', v_row.kind,
        'title', v_row.title,
        'why', v_row.why,
        'face', v_row.face,
        'severity', v_row.severity,
        'due_at', v_row.due_at,
        'created_at', v_row.created_at,
        'age_hours', v_row.age_hours,
        'is_breach', v_row.is_breach,
        'economic_ref_type', v_row.economic_ref_type,
        'economic_ref_id', v_row.economic_ref_id,
        'location', v_row.location,
        'observed_at', v_run_at
      )
    );

    if coalesce((v_result ->> 'changed')::boolean, false) then
      v_emitted_count := v_emitted_count + 1;
      v_event_ids := array_append(v_event_ids, (v_result ->> 'event_id')::uuid);
    end if;
  end loop;

  select count(*)
    into v_proof_lag_count
    from core.obligations
   where workspace_id = p_workspace_id
     and state = 'resolved'
     and receipt_id is null;

  select count(*)
    into v_raw_open_count
    from core.obligations
   where workspace_id = p_workspace_id
     and state = 'open';

  return jsonb_build_object(
    'ok', true,
    'workspace_id', p_workspace_id,
    'run_at', v_run_at,
    'evaluated_count', v_evaluated_count,
    'emitted_signal_count', v_emitted_count,
    'late_count', v_late_count,
    'at_risk_count', v_at_risk_count,
    'proof_lag_count', v_proof_lag_count,
    'visible_open_count', v_visible_open,
    'raw_open_count', v_raw_open_count,
    'event_ids', to_jsonb(v_event_ids)
  );
end;
$$;

comment on function api.run_workspace_watchdog(uuid, text) is
  'Evaluates visible operator pressure for a workspace and records typed watchdog signal events for late or at-risk live obligations.';

grant execute on function api.record_obligation_watchdog_signal(uuid, text, text, jsonb)
  to authenticated, service_role;

grant execute on function api.run_workspace_watchdog(uuid, text)
  to authenticated, service_role;

commit;
