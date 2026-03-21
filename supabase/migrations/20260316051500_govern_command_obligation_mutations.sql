begin;
insert into registry.event_types (family, name, description) values
  ('obligation', 'obligation.touched', 'Operator touch logged against an open obligation'),
  ('obligation', 'obligation.resolved', 'Operator resolved an obligation through a governed route')
on conflict (name) do nothing;
insert into core.reason_codes (code, category) values
  ('action_completed', 'workflow')
on conflict (code) do nothing;
create or replace function api.command_touch_obligation(
  p_obligation_id uuid,
  p_actor_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_obligation core.obligations%rowtype;
  v_touched_at timestamptz := now();
  v_next_due_at timestamptz := now() + interval '24 hours';
  v_chain_key text;
  v_payload jsonb;
  v_event record;
  v_receipt record;
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

  if v_obligation.state = 'resolved' then
    raise exception 'obligation % is already resolved', p_obligation_id
      using errcode = 'invalid_parameter_value';
  end if;

  update core.obligations
     set metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object(
                      'last_touch_at', v_touched_at,
                      'next_due_at', v_next_due_at,
                      'last_touch_by_actor_id', p_actor_id
                    )
                    || coalesce(p_metadata, '{}'::jsonb)
   where id = p_obligation_id
     and state != 'resolved';

  if not found then
    raise exception 'obligation % is already resolved', p_obligation_id
      using errcode = 'invalid_parameter_value';
  end if;

  v_chain_key := 'obligation:' || p_obligation_id::text;
  v_payload := jsonb_build_object(
    'obligation_id', p_obligation_id,
    'object_id', v_obligation.object_id,
    'touched_at', v_touched_at,
    'next_due_at', v_next_due_at,
    'actor_class', 'human',
    'actor_id', p_actor_id,
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );

  select *
    into v_event
    from api.append_event(
      v_obligation.workspace_id,
      v_chain_key,
      'obligation.touched',
      v_payload,
      null
    );

  select *
    into v_receipt
    from api.emit_receipt(
      v_obligation.workspace_id,
      v_event.event_id,
      v_chain_key,
      'commit',
      v_payload
    );

  return jsonb_build_object(
    'ok', true,
    'obligation_id', p_obligation_id,
    'ledger_event_id', v_event.event_id,
    'receipt_id', v_receipt.receipt_id,
    'event_seq', v_event.seq,
    'event_hash', v_event.hash,
    'receipt_seq', v_receipt.seq,
    'receipt_hash', v_receipt.hash,
    'next_due_at', v_next_due_at
  );
end;
$$;
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
  v_resolved_at timestamptz := now();
  v_chain_key text;
  v_payload jsonb;
  v_event record;
  v_receipt record;
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

  update core.obligations
     set state = 'resolved',
         terminal_action = p_terminal_action,
         terminal_reason_code = p_reason_code,
         resolved_at = v_resolved_at,
         resolved_by_actor_class = 'human',
         resolved_by_actor_id = p_actor_id,
         metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
   where id = p_obligation_id
     and state != 'resolved';

  if not found then
    raise exception 'obligation % is already resolved', p_obligation_id
      using errcode = 'invalid_parameter_value';
  end if;

  v_chain_key := 'obligation:' || p_obligation_id::text;
  v_payload := jsonb_build_object(
    'obligation_id', p_obligation_id,
    'object_id', v_obligation.object_id,
    'terminal_action', p_terminal_action,
    'reason_code', p_reason_code,
    'resolved_at', v_resolved_at,
    'actor_class', 'human',
    'actor_id', p_actor_id,
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );

  select *
    into v_event
    from api.append_event(
      v_obligation.workspace_id,
      v_chain_key,
      'obligation.resolved',
      v_payload,
      null
    );

  select *
    into v_receipt
    from api.emit_receipt(
      v_obligation.workspace_id,
      v_event.event_id,
      v_chain_key,
      'commit',
      v_payload
    );

  return jsonb_build_object(
    'ok', true,
    'obligation_id', p_obligation_id,
    'ledger_event_id', v_event.event_id,
    'receipt_id', v_receipt.receipt_id,
    'event_seq', v_event.seq,
    'event_hash', v_event.hash,
    'receipt_seq', v_receipt.seq,
    'receipt_hash', v_receipt.hash,
    'resolved_at', v_resolved_at,
    'terminal_action', p_terminal_action,
    'reason_code', p_reason_code
  );
end;
$$;
grant execute on function api.command_touch_obligation(uuid, text, jsonb) to authenticated;
grant execute on function api.command_resolve_obligation(uuid, text, text, text, jsonb) to authenticated;
commit;
