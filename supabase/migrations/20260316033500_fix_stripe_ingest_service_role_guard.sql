-- =============================================================
-- Fix service-role guard for canonical Stripe ingest.
--
-- PostgREST service_role callers reach SECURITY DEFINER functions
-- with auth.uid() = NULL. The prior role check based on auth.role()
-- proved insufficient in live replay.
--
-- Guard model:
--   - human/authenticated callers: auth.uid() is present, so
--     membership is enforced through core.assert_member()
--   - service_role callers: auth.uid() is NULL, so the function
--     relies on EXECUTE grants plus provider_connection binding
-- =============================================================

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

  if auth.uid() is not null then
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
revoke execute on function api.ingest_stripe_event(
  text, text, text, boolean, text, timestamptz, jsonb
) from public;
grant execute on function api.ingest_stripe_event(
  text, text, text, boolean, text, timestamptz, jsonb
) to authenticated, service_role;
