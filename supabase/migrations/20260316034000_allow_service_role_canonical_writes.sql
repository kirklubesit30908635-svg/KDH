-- =============================================================
-- Allow canonical machine callers through the core write surface.
--
-- api.append_event() and api.emit_receipt() are the canonical
-- writers used by api.ingest_stripe_event(). Service-role callers
-- do not carry an operator auth.uid(), so membership enforcement
-- must only run for human/authenticated callers.
-- =============================================================

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
  if auth.uid() is not null then
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
  p_workspace_id  uuid,
  p_event_id      uuid,
  p_chain_key     text,
  p_receipt_type  text,
  p_payload       jsonb default '{}'
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
  if auth.uid() is not null then
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
    payload, seq, prev_hash, hash
  ) values (
    p_workspace_id, p_event_id, v_type_id, p_chain_key,
    p_payload, 0, 'GENESIS', 'PENDING'
  )
  returning id, receipts.seq, receipts.hash
    into v_receipt_id, v_seq, v_hash;

  return query select v_receipt_id, v_seq, v_hash;
end;
$$;
grant execute on function api.append_event(uuid, text, text, jsonb, text) to authenticated;
grant execute on function api.emit_receipt(uuid, uuid, text, text, jsonb) to authenticated;
