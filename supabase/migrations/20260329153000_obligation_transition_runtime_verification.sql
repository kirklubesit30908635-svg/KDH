begin;

create or replace function api.audit_obligation_transition_runtime()
returns table (
  check_name text,
  status text,
  detail jsonb
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $$
  with authenticated_privileges as (
    select
      routine_name,
      array_agg(privilege_type order by privilege_type) as privileges
    from information_schema.routine_privileges
    where routine_schema = 'api'
      and grantee = 'authenticated'
      and routine_name in (
        'append_event',
        'emit_receipt',
        'record_obligation_transition',
        'command_resolve_obligation'
      )
    group by routine_name
  )
  select
    'authenticated_record_obligation_transition_execute'::text,
    case
      when exists (
        select 1
        from information_schema.routine_privileges
        where routine_schema = 'api'
          and grantee = 'authenticated'
          and routine_name = 'record_obligation_transition'
          and privilege_type = 'EXECUTE'
      ) then 'ok'
      else 'violation'
    end,
    jsonb_build_object(
      'grantee', 'authenticated',
      'routine_name', 'record_obligation_transition',
      'privileges', coalesce(
        (
          select to_jsonb(privileges)
          from authenticated_privileges
          where routine_name = 'record_obligation_transition'
        ),
        '[]'::jsonb
      )
    )
  union all
  select
    'authenticated_command_resolve_obligation_execute'::text,
    case
      when exists (
        select 1
        from information_schema.routine_privileges
        where routine_schema = 'api'
          and grantee = 'authenticated'
          and routine_name = 'command_resolve_obligation'
          and privilege_type = 'EXECUTE'
      ) then 'ok'
      else 'violation'
    end,
    jsonb_build_object(
      'grantee', 'authenticated',
      'routine_name', 'command_resolve_obligation',
      'privileges', coalesce(
        (
          select to_jsonb(privileges)
          from authenticated_privileges
          where routine_name = 'command_resolve_obligation'
        ),
        '[]'::jsonb
      )
    )
  union all
  select
    'authenticated_append_event_revoked'::text,
    case
      when exists (
        select 1
        from information_schema.routine_privileges
        where routine_schema = 'api'
          and grantee = 'authenticated'
          and routine_name = 'append_event'
          and privilege_type = 'EXECUTE'
      ) then 'violation'
      else 'ok'
    end,
    jsonb_build_object(
      'grantee', 'authenticated',
      'routine_name', 'append_event',
      'privileges', coalesce(
        (
          select to_jsonb(privileges)
          from authenticated_privileges
          where routine_name = 'append_event'
        ),
        '[]'::jsonb
      )
    )
  union all
  select
    'authenticated_emit_receipt_revoked'::text,
    case
      when exists (
        select 1
        from information_schema.routine_privileges
        where routine_schema = 'api'
          and grantee = 'authenticated'
          and routine_name = 'emit_receipt'
          and privilege_type = 'EXECUTE'
      ) then 'violation'
      else 'ok'
    end,
    jsonb_build_object(
      'grantee', 'authenticated',
      'routine_name', 'emit_receipt',
      'privileges', coalesce(
        (
          select to_jsonb(privileges)
          from authenticated_privileges
          where routine_name = 'emit_receipt'
        ),
        '[]'::jsonb
      )
    )
  union all
  select
    'transition_spine_table_present'::text,
    case
      when to_regclass('core.obligation_transition_events') is not null then 'ok'
      else 'violation'
    end,
    jsonb_build_object(
      'relation', 'core.obligation_transition_events'
    )
  union all
  select
    'terminal_transition_index_present'::text,
    case
      when exists (
        select 1
        from pg_indexes
        where schemaname = 'core'
          and tablename = 'obligation_transition_events'
          and indexname = 'uniq_obligation_terminal_transition'
      ) then 'ok'
      else 'violation'
    end,
    jsonb_build_object(
      'index_name', 'core.uniq_obligation_terminal_transition'
    );
$$;

grant execute on function api.audit_obligation_transition_runtime()
  to service_role;

create or replace function api.verify_obligation_closure(
  p_obligation_id uuid
)
returns table (
  obligation_id uuid,
  transition_id uuid,
  current_state text,
  next_state text,
  transition_at timestamptz,
  ledger_event_id uuid,
  event_type_name text,
  event_seq bigint,
  event_hash text,
  event_payload jsonb,
  receipt_id uuid,
  receipt_type_name text,
  receipt_seq bigint,
  receipt_hash text,
  receipt_payload jsonb,
  receipt_count bigint,
  closed_revenue_count bigint,
  terminal_count bigint
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $$
  with latest as (
    select
      ote.id as transition_id,
      ote.obligation_id,
      ote.current_state,
      ote.next_state,
      ote.created_at as transition_at,
      ote.ledger_event_id
    from core.obligation_transition_events ote
    where ote.obligation_id = p_obligation_id
    order by ote.created_at desc, ote.id desc
    limit 1
  ),
  latest_with_event as (
    select
      l.obligation_id,
      l.transition_id,
      l.current_state,
      l.next_state,
      l.transition_at,
      e.id as ledger_event_id,
      et.name as event_type_name,
      e.seq as event_seq,
      e.hash as event_hash,
      e.payload as event_payload
    from latest l
    join ledger.events e
      on e.id = l.ledger_event_id
    join registry.event_types et
      on et.id = e.event_type_id
  ),
  latest_receipt as (
    select
      rr.event_id,
      rr.id as receipt_id,
      rt.name as receipt_type_name,
      rr.seq as receipt_seq,
      rr.hash as receipt_hash,
      rr.payload as receipt_payload,
      row_number() over (
        partition by rr.event_id
        order by rr.created_at desc, rr.id desc
      ) as receipt_rank,
      count(*) over (partition by rr.event_id) as receipt_count
    from ledger.receipts rr
    join registry.receipt_types rt
      on rt.id = rr.receipt_type_id
  ),
  transition_counts as (
    select
      count(*) filter (where next_state = 'closed_revenue')::bigint as closed_revenue_count,
      count(*) filter (
        where next_state in ('closed_revenue', 'closed_no_revenue')
      )::bigint as terminal_count
    from core.obligation_transition_events
    where obligation_id = p_obligation_id
  )
  select
    e.obligation_id,
    e.transition_id,
    e.current_state,
    e.next_state,
    e.transition_at,
    e.ledger_event_id,
    e.event_type_name,
    e.event_seq,
    e.event_hash,
    e.event_payload,
    r.receipt_id,
    r.receipt_type_name,
    r.receipt_seq,
    r.receipt_hash,
    r.receipt_payload,
    coalesce(r.receipt_count, 0)::bigint as receipt_count,
    c.closed_revenue_count,
    c.terminal_count
  from latest_with_event e
  left join latest_receipt r
    on r.event_id = e.ledger_event_id
   and r.receipt_rank = 1
  cross join transition_counts c;
$$;

grant execute on function api.verify_obligation_closure(uuid)
  to service_role;

comment on function api.audit_obligation_transition_runtime() is
  'Remote runtime audit for the obligation transition spine: privilege lock, transition table, and terminal index.';

comment on function api.verify_obligation_closure(uuid) is
  'Latest transition plus linked ledger event and receipt proof for a single obligation, with duplicate and terminal counts.';

commit;
