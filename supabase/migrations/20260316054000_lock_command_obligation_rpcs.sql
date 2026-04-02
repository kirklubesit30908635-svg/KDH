begin;
revoke all on function api.command_touch_obligation(uuid, text, jsonb) from public, anon, service_role;
revoke all on function api.command_resolve_obligation(uuid, text, text, text, jsonb) from public, anon, service_role;
grant execute on function api.command_touch_obligation(uuid, text, jsonb) to authenticated;
grant execute on function api.command_resolve_obligation(uuid, text, text, text, jsonb) to authenticated;
commit;
