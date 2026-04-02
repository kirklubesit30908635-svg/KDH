begin;
insert into core.object_class_postures (kernel_class, economic_posture) values
  ('subscription', 'cost_exposure'),
  ('invoice', 'cost_exposure')
on conflict do nothing;
insert into core.reason_codes (code, category) values
  ('spend_justified', 'operations'),
  ('tooling_changed', 'operations'),
  ('tooling_terminated', 'operations'),
  ('tooling_eliminated', 'operations')
on conflict (code) do nothing;
insert into registry.event_types (family, name, description) values
  ('builder_cost', 'builder_cost.invoice_created', 'Builder operating cost invoice or billing period created'),
  ('builder_cost', 'builder_cost.payment_succeeded', 'Builder operating cost payment succeeded'),
  ('builder_cost', 'builder_cost.renewal_failed', 'Builder operating cost renewal failed'),
  ('builder_cost', 'builder_cost.subscription_cancelled', 'Builder operating cost subscription cancelled'),
  ('builder_cost', 'builder_cost.plan_changed', 'Builder operating cost plan changed')
on conflict (name) do nothing;
commit;
