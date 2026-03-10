-- economic object governance
-- kernel-owned reference authority
-- additive, backward-compatible rollout

create table if not exists core.economic_refs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references core.workspaces(id) on delete cascade,

  ref_type text not null,
  ref_key text not null,

  external_system text null,
  external_id text null,

  subject_key text null,
  customer_key text null,

  amount_cents bigint null,
  currency text not null default 'USD',

  state text not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  unique (workspace_id, ref_type, ref_key)
);

create index if not exists idx_economic_refs_workspace
  on core.economic_refs(workspace_id);

create index if not exists idx_economic_refs_type_key
  on core.economic_refs(workspace_id, ref_type, ref_key);

alter table core.economic_refs
  add constraint economic_refs_state_check
  check (state in ('open','active','sealed','breached','canceled','superseded','abandoned'));

alter table core.obligations
  add column if not exists economic_ref_id uuid null references core.economic_refs(id);

alter table ledger.receipts
  add column if not exists economic_ref_id uuid null references core.economic_refs(id);

create index if not exists idx_core_obligations_economic_ref_id
  on core.obligations(economic_ref_id);

create index if not exists idx_ledger_receipts_economic_ref_id
  on ledger.receipts(economic_ref_id);

create or replace function api.resolve_economic_ref(
  p_workspace_id uuid,
  p_ref_type text,
  p_ref_key text,
  p_external_system text default null,
  p_external_id text default null,
  p_subject_key text default null,
  p_customer_key text default null,
  p_amount_cents bigint default null,
  p_currency text default 'USD',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = api, core, public
as $$
declare
  v_id uuid;
begin
  insert into core.economic_refs (
    workspace_id,
    ref_type,
    ref_key,
    external_system,
    external_id,
    subject_key,
    customer_key,
    amount_cents,
    currency,
    metadata
  )
  values (
    p_workspace_id,
    p_ref_type,
    p_ref_key,
    p_external_system,
    p_external_id,
    p_subject_key,
    p_customer_key,
    p_amount_cents,
    p_currency,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (workspace_id, ref_type, ref_key)
  do update set
    external_system = coalesce(excluded.external_system, core.economic_refs.external_system),
    external_id = coalesce(excluded.external_id, core.economic_refs.external_id),
    subject_key = coalesce(excluded.subject_key, core.economic_refs.subject_key),
    customer_key = coalesce(excluded.customer_key, core.economic_refs.customer_key),
    amount_cents = coalesce(excluded.amount_cents, core.economic_refs.amount_cents),
    currency = coalesce(excluded.currency, core.economic_refs.currency),
    metadata = core.economic_refs.metadata || excluded.metadata
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function api.resolve_economic_ref(
  uuid, text, text, text, text, text, text, bigint, text, jsonb
) from public;

grant execute on function api.resolve_economic_ref(
  uuid, text, text, text, text, text, text, bigint, text, jsonb
) to service_role;
