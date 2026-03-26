-- 20260326110000_canonicalize_obligation_schema_phase1.sql
--
-- Phase 1 doctrine repair:
-- - restore canonical obligation fields lost by the founder-era table rebuild
-- - keep economic_ref_id normalized in metadata on core.obligations
-- - seed posture rows that the kernel doctrine expects even on no-seed builds
-- - do not introduce a new mutation rail or collapse resolved vs closed

begin;

alter table if exists core.obligations
  add column if not exists idempotency_key text,
  add column if not exists due_at timestamptz,
  add column if not exists closed_at timestamptz;

-- If a drifted branch still carries the old dedicated economic_ref_id column on
-- obligations, preserve the value in metadata and retire the structural field.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'core'
       and table_name = 'obligations'
       and column_name = 'economic_ref_id'
  ) then
    execute $sql$
      update core.obligations
         set metadata = jsonb_set(
               coalesce(metadata, '{}'::jsonb),
               '{economic_ref_id}',
               to_jsonb(economic_ref_id::text),
               true
             )
       where economic_ref_id is not null
         and coalesce(metadata ->> 'economic_ref_id', '') = ''
    $sql$;

    execute 'drop index if exists core.idx_core_obligations_economic_ref_id';
    execute 'alter table core.obligations drop column economic_ref_id';
  end if;
end $$;

create or replace function core.sync_obligation_canonical_fields_from_metadata()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  if new.due_at is null and new.metadata ? 'due_at' then
    new.due_at := core.try_parse_timestamptz(new.metadata ->> 'due_at');
  end if;

  if new.closed_at is null and new.metadata ? 'closed_at' then
    new.closed_at := core.try_parse_timestamptz(new.metadata ->> 'closed_at');
  end if;

  if new.idempotency_key is null and new.metadata ? 'idempotency_key' then
    new.idempotency_key := nullif(new.metadata ->> 'idempotency_key', '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_obligation_canonical_fields on core.obligations;

create trigger trg_sync_obligation_canonical_fields
before insert or update on core.obligations
for each row
execute function core.sync_obligation_canonical_fields_from_metadata();

update core.obligations
   set due_at = core.try_parse_timestamptz(metadata ->> 'due_at')
 where due_at is null
   and coalesce(metadata ->> 'due_at', '') <> '';

update core.obligations
   set closed_at = core.try_parse_timestamptz(metadata ->> 'closed_at')
 where closed_at is null
   and coalesce(metadata ->> 'closed_at', '') <> '';

update core.obligations
   set idempotency_key = nullif(metadata ->> 'idempotency_key', '')
 where idempotency_key is null
   and coalesce(metadata ->> 'idempotency_key', '') <> '';

drop index if exists core.uq_obligations_idempotency;

create unique index if not exists obligations_workspace_idempotency_key_uidx
  on core.obligations (workspace_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists obligations_workspace_due_at_idx
  on core.obligations (workspace_id, due_at)
  where due_at is not null;

insert into core.object_class_postures (kernel_class, economic_posture)
values
  ('subscription', 'direct_revenue'),
  ('operator_access_subscription', 'direct_revenue')
on conflict (kernel_class, economic_posture) do nothing;

commit;
