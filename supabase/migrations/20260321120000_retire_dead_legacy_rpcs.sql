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

commit;
