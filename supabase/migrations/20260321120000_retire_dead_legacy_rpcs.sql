-- =============================================================
-- Retire dead legacy RPCs that no longer match the post-founder
-- obligation model.
--
-- Why this exists:
-- - 20260314161901_rebuild_core_for_founder_console.sql dropped
--   and recreated core.objects/core.obligations with a new shape.
-- - Older washbay RPCs from 0025_api_washbay.sql and the legacy
--   Stripe overload from 0029_wire_stripe_ingest_to_economic_refs.sql
--   were left behind as callable functions.
-- - supabase db lint now proves those functions reference columns
--   that no longer exist on the canonical schema.
--
-- The canonical live surfaces remain:
-- - api.ingest_stripe_event(text, text, text, boolean, text, timestamptz, jsonb)
-- - api.command_touch_obligation(...)
-- - api.command_resolve_obligation(...)
-- - api.reconcile_obligation_proof(...)
-- - api.link_receipt_to_obligation(...)
-- =============================================================

begin;

drop function if exists api._require_job_status(uuid, uuid, text);
drop function if exists api._open_obligation(uuid, uuid, text, text, uuid, integer);
drop function if exists api._close_obligation(uuid, uuid, uuid);
drop function if exists api.create_job(uuid, uuid, uuid, text, bigint, text);
drop function if exists api.assign_operator(uuid, uuid, uuid);
drop function if exists api.add_service(uuid, uuid, text, bigint, text);
drop function if exists api.start_job(uuid, uuid);
drop function if exists api.complete_job(uuid, uuid, text);
drop function if exists api.finalize_invoice(uuid, uuid, bigint);
drop function if exists api.record_payment(uuid, uuid, bigint, text);

drop function if exists api.ingest_stripe_event(uuid, text, jsonb);
drop function if exists api.emit_receipt(uuid, uuid, text, text, jsonb);

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

grant execute on function api.emit_receipt(uuid, uuid, text, text, jsonb, text)
  to authenticated, service_role;

commit;
