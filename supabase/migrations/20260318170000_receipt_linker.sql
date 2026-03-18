-- 20260318170000_receipt_linker.sql
-- AutoKirk receipt linker adapted to the current Kernel shape
--
-- Current repo reality:
-- - proof artifacts live in ledger.receipts, not core.receipts
-- - ledger.receipts is append-only and must not be updated for linkage
-- - obligation projections already derive receipts from chain_key = 'obligation:' || obligation_id
--
-- Goal:
-- - surface proof linkage state directly on core.obligations
-- - reconcile resolved obligations to committed ledger receipts
-- - do it with deterministic linkage that fits the existing chain model
-- - provide governed retry/manual helpers without introducing a worker

begin;

-- ---------------------------------------------------------------------------
-- 1) OBLIGATION PROOF LINKAGE SURFACE
-- ---------------------------------------------------------------------------

alter table if exists core.obligations
  add column if not exists receipt_id uuid references ledger.receipts(id),
  add column if not exists proof_state text not null default 'pending',
  add column if not exists proof_strength text,
  add column if not exists linked_at timestamptz,
  add column if not exists proof_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'obligations_proof_state_check'
      and conrelid = 'core.obligations'::regclass
  ) then
    alter table core.obligations
      add constraint obligations_proof_state_check
      check (proof_state in ('pending', 'linked', 'founder_attested', 'missing'));
  end if;
end $$;

create index if not exists idx_obligations_resolved_unlinked
  on core.obligations (workspace_id, state, proof_state, receipt_id);

create index if not exists idx_ledger_receipts_chain_lookup
  on ledger.receipts (workspace_id, chain_key, created_at desc);

-- If an older branch left satisfied_by_receipt_id behind, fold it into the
-- current surface instead of losing that linkage.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'core'
      and table_name = 'obligations'
      and column_name = 'satisfied_by_receipt_id'
  ) then
    execute $sql$
      update core.obligations
         set receipt_id = coalesce(receipt_id, satisfied_by_receipt_id),
             proof_state = case
               when coalesce(receipt_id, satisfied_by_receipt_id) is not null then 'linked'
               else proof_state
             end,
             proof_strength = case
               when coalesce(receipt_id, satisfied_by_receipt_id) is not null then coalesce(proof_strength, 'kernel_receipt')
               else proof_strength
             end,
             linked_at = case
               when coalesce(receipt_id, satisfied_by_receipt_id) is not null then coalesce(linked_at, resolved_at, now())
               else linked_at
             end,
             proof_note = case
               when coalesce(receipt_id, satisfied_by_receipt_id) is not null and proof_note is null then 'Backfilled from satisfied_by_receipt_id'
               else proof_note
             end
       where satisfied_by_receipt_id is not null;
    $sql$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) DETERMINISTIC MATCHING
-- ---------------------------------------------------------------------------

create or replace function core.find_resolution_receipt_for_obligation(
  p_obligation_id uuid
) returns uuid
language plpgsql
security definer
set search_path = core, ledger, public
as $$
declare
  v_workspace_id uuid;
  v_receipt_id uuid;
begin
  select o.workspace_id
    into v_workspace_id
    from core.obligations o
   where o.id = p_obligation_id;

  if not found then
    return null;
  end if;

  select r.id
    into v_receipt_id
    from ledger.receipts r
   where r.workspace_id = v_workspace_id
     and r.chain_key = 'obligation:' || p_obligation_id::text
   order by r.seq desc, r.created_at desc
   limit 1;

  return v_receipt_id;
end;
$$;

create or replace function core.link_receipt_to_obligation(
  p_obligation_id uuid
) returns uuid
language plpgsql
security definer
set search_path = core, ledger, public
as $$
declare
  v_obligation core.obligations%rowtype;
  v_receipt_id uuid;
begin
  select *
    into v_obligation
    from core.obligations
   where id = p_obligation_id;

  if not found then
    return null;
  end if;

  if v_obligation.receipt_id is not null then
    return v_obligation.receipt_id;
  end if;

  if v_obligation.state <> 'resolved' then
    return null;
  end if;

  select core.find_resolution_receipt_for_obligation(p_obligation_id)
    into v_receipt_id;

  if v_receipt_id is null then
    update core.obligations
       set proof_state = 'missing',
           proof_strength = null,
           proof_note = 'No committed ledger receipt found on obligation chain'
     where id = p_obligation_id
       and receipt_id is null;

    return null;
  end if;

  update core.obligations
     set receipt_id = v_receipt_id,
         proof_state = 'linked',
         proof_strength = 'kernel_receipt',
         linked_at = coalesce(linked_at, now()),
         proof_note = null
   where id = p_obligation_id
     and receipt_id is null;

  return v_receipt_id;
end;
$$;

create or replace function core.try_link_obligation_for_receipt(
  p_receipt_id uuid
) returns uuid
language plpgsql
security definer
set search_path = core, ledger, public
as $$
declare
  v_receipt ledger.receipts%rowtype;
  v_obligation_id uuid;
begin
  select *
    into v_receipt
    from ledger.receipts
   where id = p_receipt_id;

  if not found then
    return null;
  end if;

  if v_receipt.chain_key not like 'obligation:%' then
    return null;
  end if;

  begin
    v_obligation_id := split_part(v_receipt.chain_key, ':', 2)::uuid;
  exception
    when invalid_text_representation then
      return null;
  end;

  update core.obligations
     set receipt_id = p_receipt_id,
         proof_state = 'linked',
         proof_strength = 'kernel_receipt',
         linked_at = coalesce(linked_at, now()),
         proof_note = null
   where id = v_obligation_id
     and workspace_id = v_receipt.workspace_id
     and state = 'resolved'
     and receipt_id is null;

  if found then
    return v_obligation_id;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) AUTOMATIC LINK TRIGGERS
-- ---------------------------------------------------------------------------

create or replace function core.trg_link_receipt_after_obligation_resolve()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if new.state = 'resolved'
     and new.receipt_id is null
     and (old.state is distinct from new.state or old.receipt_id is distinct from new.receipt_id) then
    perform core.link_receipt_to_obligation(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_link_receipt_after_obligation_resolve on core.obligations;

create trigger trg_link_receipt_after_obligation_resolve
after update on core.obligations
for each row
when (new.state = 'resolved')
execute function core.trg_link_receipt_after_obligation_resolve();

create or replace function core.trg_link_obligation_after_receipt_insert()
returns trigger
language plpgsql
security definer
set search_path = core, ledger, public
as $$
begin
  perform core.try_link_obligation_for_receipt(new.id);
  return new;
end;
$$;

drop trigger if exists trg_link_obligation_after_receipt_insert on ledger.receipts;

create trigger trg_link_obligation_after_receipt_insert
after insert on ledger.receipts
for each row
execute function core.trg_link_obligation_after_receipt_insert();

-- ---------------------------------------------------------------------------
-- 4) GOVERNED RETRY / MANUAL HELPERS
-- ---------------------------------------------------------------------------

create or replace function api.reconcile_obligation_proof(
  p_obligation_id uuid
) returns uuid
language plpgsql
security definer
set search_path = api, core, public
as $$
declare
  v_workspace_id uuid;
  v_receipt_id uuid;
begin
  select workspace_id
    into v_workspace_id
    from core.obligations
   where id = p_obligation_id;

  if v_workspace_id is null then
    raise exception 'obligation % not found', p_obligation_id;
  end if;

  perform core.assert_member(v_workspace_id);

  select core.link_receipt_to_obligation(p_obligation_id)
    into v_receipt_id;

  return v_receipt_id;
end;
$$;

create or replace function api.link_receipt_to_obligation(
  p_obligation_id uuid,
  p_receipt_id uuid,
  p_note text default 'Manual governed linkage'
) returns uuid
language plpgsql
security definer
set search_path = api, core, ledger, public
as $$
declare
  v_obligation core.obligations%rowtype;
  v_receipt ledger.receipts%rowtype;
begin
  select *
    into v_obligation
    from core.obligations
   where id = p_obligation_id;

  if not found then
    raise exception 'obligation % not found', p_obligation_id;
  end if;

  select *
    into v_receipt
    from ledger.receipts
   where id = p_receipt_id;

  if not found then
    raise exception 'receipt % not found', p_receipt_id;
  end if;

  perform core.assert_member(v_obligation.workspace_id);

  if v_obligation.workspace_id <> v_receipt.workspace_id then
    raise exception 'workspace mismatch between obligation % and receipt %', p_obligation_id, p_receipt_id;
  end if;

  if v_obligation.state <> 'resolved' then
    raise exception 'obligation % is not resolved', p_obligation_id;
  end if;

  update core.obligations
     set receipt_id = p_receipt_id,
         proof_state = 'founder_attested',
         proof_strength = 'governed_manual_link',
         linked_at = now(),
         proof_note = coalesce(p_note, 'Manual governed linkage')
   where id = p_obligation_id;

  return p_receipt_id;
end;
$$;

grant execute on function api.reconcile_obligation_proof(uuid) to authenticated, service_role;
grant execute on function api.link_receipt_to_obligation(uuid, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) HISTORICAL BACKFILL
-- ---------------------------------------------------------------------------

do $$
declare
  v_obligation record;
begin
  for v_obligation in
    select id
      from core.obligations
     where state = 'resolved'
       and receipt_id is null
  loop
    perform core.link_receipt_to_obligation(v_obligation.id);
  end loop;
end $$;

commit;
