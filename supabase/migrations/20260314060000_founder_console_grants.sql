-- =====================================================
-- Grants for founder console RPCs + seed posture matrix
-- =====================================================

-- api schema access for service_role (PostgREST uses this for service_role JWT)
grant usage on schema api to service_role;

-- execute on the three founder-console RPCs
grant execute on function api.acknowledge_object(uuid, text, text, text, text, jsonb) to authenticated, service_role;
grant execute on function api.open_obligation(uuid, uuid, text, text, text, jsonb)    to authenticated, service_role;
grant execute on function api.resolve_obligation(uuid, text, text, text, text, jsonb) to authenticated, service_role;

-- core + ledger read access for machine-state / machine-health routes
grant usage on schema ledger to service_role;
grant select on ledger.events   to service_role;
grant select on ledger.receipts to service_role;
grant select on core.objects      to service_role;
grant select on core.obligations  to service_role;
grant select on core.object_class_postures to service_role;
grant select on core.reason_codes          to service_role;

-- =====================================================
-- Seed object_class_postures matrix
-- =====================================================

insert into core.object_class_postures (kernel_class, economic_posture) values
  ('lead',       'revenue_candidate'),
  ('invoice',    'direct_revenue'),
  ('invoice',    'revenue_recovery'),
  ('job',        'direct_revenue'),
  ('job',        'cost_exposure'),
  ('campaign',   'revenue_candidate'),
  ('inspection', 'cost_exposure'),
  ('payment',    'direct_revenue'),
  ('payment',    'revenue_recovery')
on conflict do nothing;
