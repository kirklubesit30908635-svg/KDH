-- 0029_wire_stripe_ingest_to_economic_refs
-- attach Stripe economic anchors during ingest

create or replace function api.ingest_stripe_event(
  p_workspace_id uuid,
  p_event_type text,
  p_event jsonb
)
returns void
language plpgsql
security definer
set search_path = api, core, ledger, registry, public
as $$
declare
  v_stripe_charge_id text;
  v_amount bigint;
  v_currency text;
  v_economic_ref_id uuid;
begin

  -- only anchor economic events we care about
  if p_event_type = 'charge.succeeded' then

    v_stripe_charge_id := p_event ->> 'id';
    v_amount := (p_event ->> 'amount')::bigint;
    v_currency := coalesce(p_event ->> 'currency', 'USD');

    -- resolve economic reference
    v_economic_ref_id :=
      api.resolve_economic_ref(
        p_workspace_id := p_workspace_id,
        p_ref_type := 'stripe_charge',
        p_ref_key := v_stripe_charge_id,
        p_external_system := 'stripe',
        p_external_id := v_stripe_charge_id,
        p_amount_cents := v_amount,
        p_currency := v_currency,
        p_metadata := p_event
      );

    -- attach to obligations created during ingest
    update core.obligations
    set economic_ref_id = v_economic_ref_id
    where workspace_id = p_workspace_id
      and economic_ref_id is null
      and metadata ->> 'stripe_charge_id' = v_stripe_charge_id;

    -- attach to receipts if present
    update ledger.receipts
    set economic_ref_id = v_economic_ref_id
    where workspace_id = p_workspace_id
      and economic_ref_id is null
      and metadata ->> 'stripe_charge_id' = v_stripe_charge_id;

  end if;

end;
$$;
revoke all on function api.ingest_stripe_event(uuid, text, jsonb) from public;
grant execute on function api.ingest_stripe_event(uuid, text, jsonb) to service_role;
