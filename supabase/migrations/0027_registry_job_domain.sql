-- =============================================================
-- 0018_registry_job_domain.sql
-- Freeze v1 event and receipt taxonomy for the job/service domain.
--
-- Adds to existing registry without touching the 26 kernel events.
-- These types are the canonical vocabulary for all washbay/service
-- API functions. Unknown types are rejected by api.append_event().
--
-- Event families added:
--   job        — full job lifecycle
--   commercial — service, add-on, retail, invoice, payment
--   account    — operator assignment, obligation, exception
--   forecast   — projection runs, leakage, signals
--
-- Receipt types added:
--   job_created       — proof a job entered the system
--   job_started       — proof labor began
--   job_completed     — proof work was done
--   service_confirmed — proof service package was locked
--   invoice_issued    — proof invoice was finalized
--   payment_recorded  — proof payment was received
--   obligation_opened — proof an obligation was created
--   obligation_closed — proof an obligation was satisfied
--   projection_run    — proof a revenue projection was computed
-- =============================================================

BEGIN;
-- ---------------------------------------------------------------
-- Job lifecycle events
-- ---------------------------------------------------------------
INSERT INTO registry.event_types (family, name, description) VALUES
  ('job', 'job.created',         'Job record created and entered the system'),
  ('job', 'job.scheduled',       'Job assigned a scheduled time slot'),
  ('job', 'job.checked_in',      'Customer / asset checked in for job'),
  ('job', 'job.started',         'Labor started on job'),
  ('job', 'job.completed',       'Job work completed by operator'),
  ('job', 'job.closed',          'Job administratively closed after invoice + payment'),
  ('job', 'job.voided',          'Job voided before work began'),
  ('job', 'job.reopened',        'Completed job reopened for correction')
ON CONFLICT (name) DO NOTHING;
-- ---------------------------------------------------------------
-- Commercial events
-- ---------------------------------------------------------------
INSERT INTO registry.event_types (family, name, description) VALUES
  ('commercial', 'service.added',          'Service line item added to job'),
  ('commercial', 'service.removed',        'Service line item removed from job'),
  ('commercial', 'addon.offered',          'Add-on presented to customer'),
  ('commercial', 'addon.accepted',         'Customer accepted add-on'),
  ('commercial', 'addon.declined',         'Customer declined add-on'),
  ('commercial', 'retail.item_added',      'Retail item attached to job'),
  ('commercial', 'discount.applied',       'Discount applied to job'),
  ('commercial', 'invoice.finalized',      'Invoice locked and sent'),
  ('commercial', 'payment.received',       'Payment recorded against invoice')
ON CONFLICT (name) DO NOTHING;
-- ---------------------------------------------------------------
-- Accountability events
-- ---------------------------------------------------------------
INSERT INTO registry.event_types (family, name, description) VALUES
  ('account', 'operator.assigned',       'Operator assigned responsibility for job'),
  ('account', 'obligation.created',      'System created an obligation from a trigger event'),
  ('account', 'obligation.satisfied',    'Obligation satisfied by a receipt or follow-on event'),
  ('account', 'obligation.expired',      'Obligation passed its deadline without satisfaction'),
  ('account', 'exception.recorded',      'Operational exception manually or automatically recorded')
ON CONFLICT (name) DO NOTHING;
-- ---------------------------------------------------------------
-- Forecast / intelligence events
-- ---------------------------------------------------------------
INSERT INTO registry.event_types (family, name, description) VALUES
  ('forecast', 'revenue.projection_run',  'Revenue projection computed for workspace'),
  ('forecast', 'signal.emitted',          'Operational or commercial signal surfaced'),
  ('forecast', 'leakage.detected',        'Revenue leakage pattern detected')
ON CONFLICT (name) DO NOTHING;
-- ---------------------------------------------------------------
-- Receipt types for job domain
-- ---------------------------------------------------------------
INSERT INTO registry.receipt_types (name, description) VALUES
  ('job_created',       'Proof a job was created and accepted into the system'),
  ('job_started',       'Proof labor began on a job'),
  ('job_completed',     'Proof work was completed by an operator'),
  ('service_confirmed', 'Proof service package was confirmed on job'),
  ('invoice_issued',    'Proof invoice was finalized and sent'),
  ('payment_recorded',  'Proof payment was received against an invoice'),
  ('obligation_opened', 'Proof an obligation was created and is open'),
  ('obligation_closed', 'Proof an obligation was satisfied'),
  ('projection_run',    'Proof a revenue projection was computed and stored')
ON CONFLICT (name) DO NOTHING;
COMMIT;
