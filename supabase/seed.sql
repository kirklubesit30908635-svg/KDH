begin;

insert into core.tenants (id, slug, name, created_at, parent_tenant_id) values
  ('a0000000-0000-0000-0000-000000000001', 'kdh', 'Kirk Digital Holdings LLC', '2026-03-27 17:39:36.263213+00', null),
  ('a0000000-0000-0000-0000-000000000002', 'ak-ip', 'AutoKirk IP Holdings LLC', '2026-03-27 17:39:36.263213+00', 'a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', 'ak-systems', 'AutoKirk Systems', '2026-03-27 17:39:36.263213+00', 'a0000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into core.workspaces (id, tenant_id, slug, name, created_at) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'kdh-ops', 'KDH Operations', '2026-03-27 17:39:36.263213+00'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'ak-ops', 'AK Systems Operations', '2026-03-27 17:39:36.263213+00')
on conflict (id) do nothing;

insert into registry.event_types (id, family, name, description, created_at) values
  (1, 'system', 'system.booted', 'Kernel bootstrap completed', '2026-03-27 17:39:36.054937+00'),
  (2, 'system', 'system.shutdown', 'Kernel shutdown initiated', '2026-03-27 17:39:36.054937+00'),
  (3, 'auth', 'auth.login', 'Operator authenticated', '2026-03-27 17:39:36.054937+00'),
  (4, 'auth', 'auth.logout', 'Operator session terminated', '2026-03-27 17:39:36.054937+00'),
  (5, 'workflow', 'workflow.started', 'Workflow instance started', '2026-03-27 17:39:36.054937+00'),
  (6, 'workflow', 'workflow.completed', 'Workflow instance completed', '2026-03-27 17:39:36.054937+00'),
  (7, 'workflow', 'workflow.failed', 'Workflow instance failed', '2026-03-27 17:39:36.054937+00'),
  (8, 'task', 'task.enqueued', 'Task placed in queue', '2026-03-27 17:39:36.054937+00'),
  (9, 'task', 'task.executed', 'Task execution completed', '2026-03-27 17:39:36.054937+00'),
  (10, 'task', 'task.failed', 'Task execution failed', '2026-03-27 17:39:36.054937+00'),
  (11, 'agent', 'agent.invoked', 'Agent invocation triggered', '2026-03-27 17:39:36.054937+00'),
  (12, 'agent', 'agent.responded', 'Agent produced a response', '2026-03-27 17:39:36.054937+00'),
  (13, 'tool', 'tool.called', 'Tool call initiated', '2026-03-27 17:39:36.054937+00'),
  (14, 'tool', 'tool.returned', 'Tool call returned a result', '2026-03-27 17:39:36.054937+00'),
  (15, 'ingest', 'ingest.received', 'Raw event received from source', '2026-03-27 17:39:36.054937+00'),
  (16, 'ingest', 'ingest.trusted', 'Raw event promoted to trusted', '2026-03-27 17:39:36.054937+00'),
  (17, 'ledger', 'ledger.appended', 'Event appended to ledger chain', '2026-03-27 17:39:36.054937+00'),
  (18, 'ledger', 'ledger.chain_created', 'New ledger chain initialised', '2026-03-27 17:39:36.054937+00'),
  (19, 'receipt', 'receipt.issued', 'Receipt issued for an event', '2026-03-27 17:39:36.054937+00'),
  (20, 'notification', 'notification.sent', 'Notification dispatched', '2026-03-27 17:39:36.054937+00'),
  (21, 'notification', 'notification.failed', 'Notification delivery failed', '2026-03-27 17:39:36.054937+00'),
  (22, 'audit', 'audit.accessed', 'Resource access recorded', '2026-03-27 17:39:36.054937+00'),
  (23, 'audit', 'audit.modified', 'Resource modification recorded', '2026-03-27 17:39:36.054937+00'),
  (24, 'integration', 'integration.connected', 'External integration connected', '2026-03-27 17:39:36.054937+00'),
  (25, 'integration', 'integration.synced', 'External integration sync completed', '2026-03-27 17:39:36.054937+00'),
  (26, 'stripe', 'stripe.payment_intent.succeeded', 'Stripe PaymentIntent succeeded', '2026-03-27 17:39:36.137331+00'),
  (27, 'stripe', 'stripe.payment_intent.payment_failed', 'Stripe PaymentIntent payment failed', '2026-03-27 17:39:36.137331+00'),
  (28, 'stripe', 'stripe.payment_intent.created', 'Stripe PaymentIntent created', '2026-03-27 17:39:36.137331+00'),
  (29, 'stripe', 'stripe.payment_intent.canceled', 'Stripe PaymentIntent canceled', '2026-03-27 17:39:36.137331+00'),
  (30, 'stripe', 'stripe.invoice.paid', 'Stripe Invoice paid', '2026-03-27 17:39:36.137331+00'),
  (31, 'stripe', 'stripe.invoice.payment_failed', 'Stripe Invoice payment failed', '2026-03-27 17:39:36.137331+00'),
  (32, 'stripe', 'stripe.invoice.created', 'Stripe Invoice created', '2026-03-27 17:39:36.137331+00'),
  (33, 'stripe', 'stripe.invoice.finalized', 'Stripe Invoice finalized', '2026-03-27 17:39:36.137331+00'),
  (34, 'stripe', 'stripe.customer.subscription.created', 'Stripe Subscription created', '2026-03-27 17:39:36.137331+00'),
  (35, 'stripe', 'stripe.customer.subscription.updated', 'Stripe Subscription updated', '2026-03-27 17:39:36.137331+00'),
  (36, 'stripe', 'stripe.customer.subscription.deleted', 'Stripe Subscription deleted', '2026-03-27 17:39:36.137331+00'),
  (37, 'stripe', 'stripe.customer.subscription.paused', 'Stripe Subscription paused', '2026-03-27 17:39:36.137331+00'),
  (38, 'stripe', 'stripe.customer.subscription.resumed', 'Stripe Subscription resumed', '2026-03-27 17:39:36.137331+00'),
  (39, 'stripe', 'stripe.checkout.session.completed', 'Stripe Checkout Session completed', '2026-03-27 17:39:36.137331+00'),
  (40, 'stripe', 'stripe.checkout.session.expired', 'Stripe Checkout Session expired', '2026-03-27 17:39:36.137331+00'),
  (41, 'stripe', 'stripe.charge.succeeded', 'Stripe Charge succeeded', '2026-03-27 17:39:36.137331+00'),
  (42, 'stripe', 'stripe.charge.failed', 'Stripe Charge failed', '2026-03-27 17:39:36.137331+00'),
  (43, 'stripe', 'stripe.charge.refunded', 'Stripe Charge refunded', '2026-03-27 17:39:36.137331+00'),
  (44, 'job', 'job.created', 'Job record created and entered the system', '2026-03-27 17:39:36.246475+00'),
  (45, 'job', 'job.scheduled', 'Job assigned a scheduled time slot', '2026-03-27 17:39:36.246475+00'),
  (46, 'job', 'job.checked_in', 'Customer / asset checked in for job', '2026-03-27 17:39:36.246475+00'),
  (47, 'job', 'job.started', 'Labor started on job', '2026-03-27 17:39:36.246475+00'),
  (48, 'job', 'job.completed', 'Job work completed by operator', '2026-03-27 17:39:36.246475+00'),
  (49, 'job', 'job.closed', 'Job administratively closed after invoice + payment', '2026-03-27 17:39:36.246475+00'),
  (50, 'job', 'job.voided', 'Job voided before work began', '2026-03-27 17:39:36.246475+00'),
  (51, 'job', 'job.reopened', 'Completed job reopened for correction', '2026-03-27 17:39:36.246475+00'),
  (52, 'commercial', 'service.added', 'Service line item added to job', '2026-03-27 17:39:36.246475+00'),
  (53, 'commercial', 'service.removed', 'Service line item removed from job', '2026-03-27 17:39:36.246475+00'),
  (54, 'commercial', 'addon.offered', 'Add-on presented to customer', '2026-03-27 17:39:36.246475+00'),
  (55, 'commercial', 'addon.accepted', 'Customer accepted add-on', '2026-03-27 17:39:36.246475+00'),
  (56, 'commercial', 'addon.declined', 'Customer declined add-on', '2026-03-27 17:39:36.246475+00'),
  (57, 'commercial', 'retail.item_added', 'Retail item attached to job', '2026-03-27 17:39:36.246475+00'),
  (58, 'commercial', 'discount.applied', 'Discount applied to job', '2026-03-27 17:39:36.246475+00'),
  (59, 'commercial', 'invoice.finalized', 'Invoice locked and sent', '2026-03-27 17:39:36.246475+00'),
  (60, 'commercial', 'payment.received', 'Payment recorded against invoice', '2026-03-27 17:39:36.246475+00'),
  (61, 'account', 'operator.assigned', 'Operator assigned responsibility for job', '2026-03-27 17:39:36.246475+00'),
  (62, 'account', 'obligation.created', 'System created an obligation from a trigger event', '2026-03-27 17:39:36.246475+00'),
  (63, 'account', 'obligation.satisfied', 'Obligation satisfied by a receipt or follow-on event', '2026-03-27 17:39:36.246475+00'),
  (64, 'account', 'obligation.expired', 'Obligation passed its deadline without satisfaction', '2026-03-27 17:39:36.246475+00'),
  (65, 'account', 'exception.recorded', 'Operational exception manually or automatically recorded', '2026-03-27 17:39:36.246475+00'),
  (66, 'forecast', 'revenue.projection_run', 'Revenue projection computed for workspace', '2026-03-27 17:39:36.246475+00'),
  (67, 'forecast', 'signal.emitted', 'Operational or commercial signal surfaced', '2026-03-27 17:39:36.246475+00'),
  (68, 'forecast', 'leakage.detected', 'Revenue leakage pattern detected', '2026-03-27 17:39:36.246475+00'),
  (69, 'obligation', 'obligation.resolved', 'Obligation resolved - terminal action recorded', '2026-03-27 17:39:36.268829+00'),
  (70, 'stripe', 'stripe.invoice.updated', 'Stripe Invoice updated', '2026-03-27 17:39:36.428323+00'),
  (71, 'stripe', 'stripe.charge.dispute.created', 'Stripe Charge dispute created', '2026-03-27 17:39:36.428323+00'),
  (72, 'obligation', 'obligation.touched', 'Operator touch logged against an open obligation', '2026-03-27 17:39:36.446135+00'),
  (74, 'builder_cost', 'builder_cost.invoice_created', 'Builder operating cost invoice or billing period created', '2026-03-27 17:39:36.456948+00'),
  (75, 'builder_cost', 'builder_cost.payment_succeeded', 'Builder operating cost payment succeeded', '2026-03-27 17:39:36.456948+00'),
  (76, 'builder_cost', 'builder_cost.renewal_failed', 'Builder operating cost renewal failed', '2026-03-27 17:39:36.456948+00'),
  (77, 'builder_cost', 'builder_cost.subscription_cancelled', 'Builder operating cost subscription cancelled', '2026-03-27 17:39:36.456948+00'),
  (78, 'builder_cost', 'builder_cost.plan_changed', 'Builder operating cost plan changed', '2026-03-27 17:39:36.456948+00')
on conflict (id) do nothing;

insert into core.object_class_postures (kernel_class, economic_posture) values
  ('lead', 'revenue_candidate'),
  ('invoice', 'direct_revenue'),
  ('invoice', 'revenue_recovery'),
  ('job', 'direct_revenue'),
  ('job', 'cost_exposure'),
  ('campaign', 'revenue_candidate'),
  ('inspection', 'cost_exposure'),
  ('payment', 'direct_revenue'),
  ('payment', 'revenue_recovery'),
  ('subscription', 'cost_exposure'),
  ('invoice', 'cost_exposure'),
  ('subscription', 'direct_revenue')
on conflict do nothing;

insert into registry.receipt_types (id, name, description, created_at) values
  (1, 'ack', 'Positive acknowledgment - event accepted and processed', '2026-03-27 17:39:36.054937+00'),
  (2, 'nack', 'Negative acknowledgment - event rejected, retry eligible', '2026-03-27 17:39:36.054937+00'),
  (3, 'error', 'Processing error - event failed, not retry eligible', '2026-03-27 17:39:36.054937+00'),
  (4, 'commit', 'Commit confirmation - durable side-effect recorded', '2026-03-27 17:39:36.054937+00'),
  (5, 'job_created', 'Proof a job was created and accepted into the system', '2026-03-27 17:39:36.246475+00'),
  (6, 'job_started', 'Proof labor began on a job', '2026-03-27 17:39:36.246475+00'),
  (7, 'job_completed', 'Proof work was completed by an operator', '2026-03-27 17:39:36.246475+00'),
  (8, 'service_confirmed', 'Proof service package was confirmed on job', '2026-03-27 17:39:36.246475+00'),
  (9, 'invoice_issued', 'Proof invoice was finalized and sent', '2026-03-27 17:39:36.246475+00'),
  (10, 'payment_recorded', 'Proof payment was received against an invoice', '2026-03-27 17:39:36.246475+00'),
  (11, 'obligation_opened', 'Proof an obligation was created and is open', '2026-03-27 17:39:36.246475+00'),
  (12, 'obligation_closed', 'Proof an obligation was satisfied', '2026-03-27 17:39:36.246475+00'),
  (13, 'projection_run', 'Proof a revenue projection was computed and stored', '2026-03-27 17:39:36.246475+00'),
  (14, 'obligation_proof', 'Proof of obligation resolution committed to the ledger', '2026-03-27 17:39:36.268829+00')
on conflict (id) do nothing;

insert into core.reason_codes (code, category, is_active) values
  ('customer_declined', 'sales', true),
  ('unqualified', 'sales', true),
  ('duplicate', 'system', true),
  ('no_response', 'sales', true),
  ('pricing_rejected', 'sales', true),
  ('invalid_object', 'system', true),
  ('external_loss', 'external', true),
  ('client_routed_elsewhere', 'external', true),
  ('action_completed', 'workflow', true),
  ('spend_justified', 'operations', true),
  ('tooling_changed', 'operations', true),
  ('tooling_terminated', 'operations', true),
  ('tooling_eliminated', 'operations', true),
  ('subscription_deleted', 'external', true),
  ('access_activated', 'workflow', true),
  ('subscription_cancelled_before_activation', 'billing', true)
on conflict (code) do nothing;

select setval('registry.event_types_id_seq', greatest((select coalesce(max(id), 1) from registry.event_types), 1), true);
select setval('registry.receipt_types_id_seq', greatest((select coalesce(max(id), 1) from registry.receipt_types), 1), true);

commit;
