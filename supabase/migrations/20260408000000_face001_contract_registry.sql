-- =============================================================
-- 20260408000000_face001_contract_registry.sql
--
-- Phase 1: Freeze the Face #001 contract in the kernel.
--
-- Replaces implied Stripe behavior (currently encoded only in
-- src/lib/stripe_first_wedge_contract.ts and
-- src/lib/kernel/rules.ts) with explicit governed contract tables
-- in the registry schema. The app should derive command options,
-- resolution choices, and receipt requirements from these tables
-- rather than from TypeScript-only constants.
--
-- No new mutation RPC surfaces in this phase.
-- No changes to api.ingest_stripe_event or command RPCs.
-- No changes to ledger schema.
--
-- Adds:
--   registry.face_definitions          — named face entities
--   registry.face_event_rules          — Stripe event → obligation map
--   registry.face_obligation_rules     — obligation type definitions
--   registry.face_command_rules        — allowed commands per obligation
--   registry.face_resolution_rules     — terminal action requirements
--   registry.face_receipt_requirements — receipt field requirements
--   api.get_face_contract(text)        — read helper (returns jsonb)
--   core.v_face001_contract_summary    — flat contract view
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. registry.face_definitions
--    One row per named operating face.
-- ---------------------------------------------------------------

CREATE TABLE registry.face_definitions (
  face_key     text        PRIMARY KEY,
  display_name text        NOT NULL,
  status       text        NOT NULL
                           CHECK (status IN ('draft', 'active', 'retired')),
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE registry.face_definitions IS
  'Named operating faces. A face is a governed projection over kernel truth '
  'scoped to a domain (e.g. Stripe billing). Faces are read-only projection '
  'rules; they hold no mutation authority.';

INSERT INTO registry.face_definitions (face_key, display_name, status, description)
VALUES (
  'stripe_billing_revenue_enforcement',
  'Stripe Billing — Revenue Enforcement',
  'active',
  'Face #001. Governs operator queue work arising from Stripe billing events: '
  'invoice collection, payment recovery, dispute response, and refund processing. '
  'Subscription lifecycle events remain deferred until activation semantics are '
  'formalized. This face is a projection over kernel truth only — it is not a '
  'second billing system.'
);

-- ---------------------------------------------------------------
-- 2. registry.face_event_rules
--    Maps provider source events to canonical event types,
--    object classes, and obligation types.
-- ---------------------------------------------------------------

CREATE TABLE registry.face_event_rules (
  id                    serial      PRIMARY KEY,
  face_key              text        NOT NULL
                                    REFERENCES registry.face_definitions(face_key),
  provider              text        NOT NULL,
  source_event_key      text        NOT NULL,
  canonical_event_type  text        NOT NULL
                                    REFERENCES registry.event_types(name),
  object_class          text        NOT NULL,
  obligation_type       text        NOT NULL,
  open_rule             text        NOT NULL,
  is_deferred           boolean     NOT NULL DEFAULT false,
  deferred_reason       text,
  UNIQUE (face_key, provider, source_event_key),
  CONSTRAINT face_event_rules_deferred_reason_check
    CHECK (
      (is_deferred = false AND deferred_reason IS NULL)
      OR (is_deferred = true AND deferred_reason IS NOT NULL)
    )
);

COMMENT ON TABLE registry.face_event_rules IS
  'Maps provider source events to the canonical event type, object class, '
  'and obligation type that govern them within a face. Deferred events are '
  'tracked but do not open obligations until promoted to active.';

-- Supported events
-- Supported events (is_deferred=false, deferred_reason=NULL)
INSERT INTO registry.face_event_rules
  (face_key, provider, source_event_key, canonical_event_type,
   object_class, obligation_type, open_rule, is_deferred)
VALUES

  ('stripe_billing_revenue_enforcement', 'stripe',
   'checkout.session.completed',
   'stripe.checkout.session.completed',
   'payment', 'verify_subscription_activation',
   'Open when a verified checkout.session.completed event lands and no '
   'unresolved verify_subscription_activation obligation exists for '
   'workspace_id + checkout session id.',
   false),

  ('stripe_billing_revenue_enforcement', 'stripe',
   'invoice.paid',
   'stripe.invoice.paid',
   'invoice', 'collect_payment',
   'Open when a verified invoice.paid event lands and no unresolved '
   'collect_payment obligation exists for workspace_id + invoice id '
   '+ source_event_id.',
   false),

  ('stripe_billing_revenue_enforcement', 'stripe',
   'invoice.payment_failed',
   'stripe.invoice.payment_failed',
   'invoice', 'restore_payment_method',
   'Open when a verified invoice.payment_failed event lands and no '
   'unresolved restore_payment_method obligation exists for '
   'workspace_id + invoice id.',
   false),

  ('stripe_billing_revenue_enforcement', 'stripe',
   'charge.dispute.created',
   'stripe.charge.dispute.created',
   'payment', 'resolve_billing_exception',
   'Open when a verified charge.dispute.created event lands and no '
   'unresolved resolve_billing_exception obligation exists for '
   'workspace_id + charge/dispute reference.',
   false),

  ('stripe_billing_revenue_enforcement', 'stripe',
   'charge.refunded',
   'stripe.charge.refunded',
   'payment', 'resolve_billing_exception',
   'Open when a verified charge.refunded event lands and no unresolved '
   'resolve_billing_exception obligation exists for workspace_id + '
   'charge id + source_event_id.',
   false);

-- Deferred events — tracked but no obligation opens until promoted
INSERT INTO registry.face_event_rules
  (face_key, provider, source_event_key, canonical_event_type,
   object_class, obligation_type, open_rule, is_deferred, deferred_reason)
VALUES

  ('stripe_billing_revenue_enforcement', 'stripe',
   'customer.subscription.created',
   'stripe.customer.subscription.created',
   'operator_access_subscription', 'verify_subscription_activation',
   'Deferred. No obligation opens until subscription activation '
   'semantics are formalized.',
   true,
   'Subscription activation and onboarding semantics are not formalized '
   'enough for authoritative Face #001 support.'),

  ('stripe_billing_revenue_enforcement', 'stripe',
   'customer.subscription.deleted',
   'stripe.customer.subscription.deleted',
   'operator_access_subscription', 'review_subscription_cancellation',
   'Deferred. No obligation opens until subscription churn semantics '
   'are formalized.',
   true,
   'Cancellation and churn handling are not formalized enough for '
   'authoritative Face #001 support.');

-- ---------------------------------------------------------------
-- 3. registry.face_obligation_rules
--    Defines the obligation types owned by each face, including
--    their kernel_class/posture bindings and display metadata.
-- ---------------------------------------------------------------

CREATE TABLE registry.face_obligation_rules (
  face_key         text    NOT NULL
                           REFERENCES registry.face_definitions(face_key),
  obligation_type  text    NOT NULL,
  kernel_class     text    NOT NULL,
  economic_posture text    NOT NULL,
  display_label    text    NOT NULL,
  description      text,
  is_active        boolean NOT NULL DEFAULT true,
  PRIMARY KEY (face_key, obligation_type)
);

COMMENT ON TABLE registry.face_obligation_rules IS
  'Defines obligation types for each face. Provides kernel_class and '
  'economic_posture bindings so the face projector can open obligations '
  'through the canonical kernel surfaces without embedding those decisions '
  'in ingest logic.';

INSERT INTO registry.face_obligation_rules
  (face_key, obligation_type, kernel_class, economic_posture,
   display_label, description, is_active)
VALUES

  ('stripe_billing_revenue_enforcement',
   'collect_payment',
   'invoice', 'direct_revenue',
   'Collect Payment',
   'Confirm that a paid invoice is posted to the correct customer and '
   'accounting path. Closes the revenue recording follow-through.',
   true),

  ('stripe_billing_revenue_enforcement',
   'restore_payment_method',
   'invoice', 'revenue_recovery',
   'Restore Payment Method',
   'Attempt payment collection recovery after an invoice payment failure. '
   'Document blocker or customer outcome before closing.',
   true),

  ('stripe_billing_revenue_enforcement',
   'verify_subscription_activation',
   'payment', 'direct_revenue',
   'Verify Subscription Activation',
   'Confirm that a completed checkout session resulted in a properly '
   'activated subscription and correct operator access grant.',
   true),

  ('stripe_billing_revenue_enforcement',
   'review_subscription_cancellation',
   'operator_access_subscription', 'direct_revenue',
   'Review Subscription Cancellation',
   'Review and document the cancellation of a customer subscription. '
   'Deferred until lifecycle semantics are formalized.',
   false),

  ('stripe_billing_revenue_enforcement',
   'confirm_invoice_collection',
   'invoice', 'direct_revenue',
   'Confirm Invoice Collection',
   'Confirm that invoice collection is complete and downstream '
   'accounting treatment has been applied.',
   true),

  ('stripe_billing_revenue_enforcement',
   'resolve_billing_exception',
   'payment', 'revenue_recovery',
   'Resolve Billing Exception',
   'Resolve a billing exception arising from a dispute or refund. '
   'Verify posting, accounting treatment, and customer-facing completion.',
   true);

-- ---------------------------------------------------------------
-- 4. registry.face_command_rules
--    Defines the commands an operator can issue against an
--    obligation within a face, including terminal status and
--    proof requirements.
-- ---------------------------------------------------------------

CREATE TABLE registry.face_command_rules (
  face_key           text    NOT NULL
                             REFERENCES registry.face_definitions(face_key),
  obligation_type    text    NOT NULL,
  command_type       text    NOT NULL,
  display_label      text    NOT NULL,
  requires_note      boolean NOT NULL DEFAULT false,
  requires_proof_ref boolean NOT NULL DEFAULT false,
  is_terminal        boolean NOT NULL DEFAULT false,
  PRIMARY KEY (face_key, obligation_type, command_type),
  FOREIGN KEY (face_key, obligation_type)
    REFERENCES registry.face_obligation_rules(face_key, obligation_type)
);

COMMENT ON TABLE registry.face_command_rules IS
  'Commands an operator may issue against an obligation within a face. '
  'The UI must derive its action menu from this table, not from hardcoded '
  'TypeScript. Terminal commands advance to a closed state; non-terminal '
  'commands advance state without closing the obligation.';

-- Seed commands for all active Face #001 obligation types.
-- Active obligations: collect_payment, restore_payment_method,
--   verify_subscription_activation, confirm_invoice_collection,
--   resolve_billing_exception.
-- review_subscription_cancellation omitted (deferred, is_active=false).

DO $$
DECLARE
  v_obligation_types text[] := ARRAY[
    'collect_payment',
    'restore_payment_method',
    'verify_subscription_activation',
    'confirm_invoice_collection',
    'resolve_billing_exception'
  ];
  v_ob text;
BEGIN
  FOREACH v_ob IN ARRAY v_obligation_types LOOP

    INSERT INTO registry.face_command_rules
      (face_key, obligation_type, command_type, display_label,
       requires_note, requires_proof_ref, is_terminal)
    VALUES
      -- Non-terminal: acknowledge ownership
      ('stripe_billing_revenue_enforcement', v_ob,
       'acknowledge',
       'Acknowledge',
       false, false, false),

      -- Non-terminal: request additional information or action
      ('stripe_billing_revenue_enforcement', v_ob,
       'request_follow_up',
       'Request Follow-Up',
       true, false, false),

      -- Non-terminal: record an external or internal blocker
      ('stripe_billing_revenue_enforcement', v_ob,
       'mark_blocked',
       'Mark Blocked',
       true, false, false),

      -- Terminal: obligation completed with supporting proof
      ('stripe_billing_revenue_enforcement', v_ob,
       'resolve_closed',
       'Resolve — Closed',
       false, true, true),

      -- Terminal: obligation eliminated (duplicate, invalid object, etc.)
      ('stripe_billing_revenue_enforcement', v_ob,
       'resolve_eliminated',
       'Resolve — Eliminated',
       true, false, true),

      -- Terminal: obligation breached SLA or contractual requirement
      ('stripe_billing_revenue_enforcement', v_ob,
       'resolve_breached',
       'Resolve — Breached',
       true, true, true);

  END LOOP;
END;
$$;

-- ---------------------------------------------------------------
-- 5. registry.face_resolution_rules
--    Defines what is required to accept each terminal action
--    within a face and obligation type.
-- ---------------------------------------------------------------

CREATE TABLE registry.face_resolution_rules (
  face_key             text    NOT NULL
                               REFERENCES registry.face_definitions(face_key),
  obligation_type      text    NOT NULL,
  terminal_action      text    NOT NULL,
  proof_state          text    NOT NULL
                               CHECK (proof_state IN (
                                 'linked', 'asserted', 'missing'
                               )),
  receipt_type         text    NOT NULL,
  reason_code_required boolean NOT NULL DEFAULT true,
  proof_ref_required   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (face_key, obligation_type, terminal_action),
  FOREIGN KEY (face_key, obligation_type)
    REFERENCES registry.face_obligation_rules(face_key, obligation_type)
);

COMMENT ON TABLE registry.face_resolution_rules IS
  'Defines the proof requirements for each terminal action within a face. '
  'The resolution RPC must validate the incoming terminal action against '
  'this table before accepting it.';

DO $$
DECLARE
  v_obligation_types text[] := ARRAY[
    'collect_payment',
    'restore_payment_method',
    'verify_subscription_activation',
    'confirm_invoice_collection',
    'resolve_billing_exception'
  ];
  v_ob text;
BEGIN
  FOREACH v_ob IN ARRAY v_obligation_types LOOP

    INSERT INTO registry.face_resolution_rules
      (face_key, obligation_type, terminal_action,
       proof_state, receipt_type,
       reason_code_required, proof_ref_required)
    VALUES
      -- closed: full proof required
      ('stripe_billing_revenue_enforcement', v_ob,
       'closed',
       'linked', 'obligation_resolution',
       true, true),

      -- eliminated: reason required, proof ref not mandatory
      ('stripe_billing_revenue_enforcement', v_ob,
       'eliminated',
       'linked', 'obligation_resolution',
       true, false),

      -- breached: both reason and proof ref required
      ('stripe_billing_revenue_enforcement', v_ob,
       'breached',
       'linked', 'obligation_resolution',
       true, true);

  END LOOP;
END;
$$;

-- ---------------------------------------------------------------
-- 6. registry.face_receipt_requirements
--    Defines required fields in the receipt payload per receipt
--    type within a face.
-- ---------------------------------------------------------------

CREATE TABLE registry.face_receipt_requirements (
  face_key       text NOT NULL
                      REFERENCES registry.face_definitions(face_key),
  receipt_type   text NOT NULL,
  required_field text NOT NULL,
  requirement    text NOT NULL,
  PRIMARY KEY (face_key, receipt_type, required_field)
);

COMMENT ON TABLE registry.face_receipt_requirements IS
  'Required payload fields for receipts of a given type within a face. '
  'The resolution RPC must verify these fields are present before '
  'committing a terminal receipt.';

INSERT INTO registry.face_receipt_requirements
  (face_key, receipt_type, required_field, requirement)
VALUES
  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'receipt_type',
   'Must be obligation_resolution for all terminal state transitions.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'workspace_id',
   'Must match the workspace that owns the obligation, object, and event chain.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'actor_id',
   'Operator or system actor that performed the governed state transition.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'object_id',
   'Kernel object id for the economic object underlying this obligation.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'economic_ref_id',
   'Economic reference id resolving to the Stripe invoice, charge, or subscription.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'obligation_id',
   'The governed obligation being resolved. Must point to an existing open obligation.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'movement_type',
   'Movement type matching the face_event_rules row that opened this obligation.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'source_event_id',
   'Canonical ledger event id or Stripe event id that opened the governed obligation.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'resolution_state',
   'Terminal state: closed, eliminated, or breached.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'reason_code',
   'Required on all terminal transitions. No silent closure.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'proof_ref',
   'Required for closed and breached terminal actions. Points to the supporting proof artifact.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'occurred_at',
   'When the business event or operator action actually occurred.'),

  ('stripe_billing_revenue_enforcement', 'obligation_resolution',
   'recorded_at',
   'When the kernel committed the receipt.');

-- ---------------------------------------------------------------
-- 7. api.get_face_contract
--    Read helper. Returns the full face contract as a JSON blob
--    so the app can derive command menus and resolution options
--    from DB truth rather than from TypeScript constants.
--
--    Returns NULL when face_key is not found.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.get_face_contract(p_face_key text)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'face_key',       fd.face_key,
    'display_name',   fd.display_name,
    'status',         fd.status,
    'description',    fd.description,

    'event_rules', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'provider',             fer.provider,
          'source_event_key',     fer.source_event_key,
          'canonical_event_type', fer.canonical_event_type,
          'object_class',         fer.object_class,
          'obligation_type',      fer.obligation_type,
          'open_rule',            fer.open_rule,
          'is_deferred',          fer.is_deferred,
          'deferred_reason',      fer.deferred_reason
        )
        ORDER BY fer.is_deferred, fer.source_event_key
      )
      FROM registry.face_event_rules fer
      WHERE fer.face_key = fd.face_key
    ),

    'obligation_rules', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'obligation_type',  fob.obligation_type,
          'kernel_class',     fob.kernel_class,
          'economic_posture', fob.economic_posture,
          'display_label',    fob.display_label,
          'description',      fob.description,
          'is_active',        fob.is_active,
          'commands', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'command_type',       fc.command_type,
                'display_label',      fc.display_label,
                'requires_note',      fc.requires_note,
                'requires_proof_ref', fc.requires_proof_ref,
                'is_terminal',        fc.is_terminal
              )
              ORDER BY fc.is_terminal, fc.command_type
            )
            FROM registry.face_command_rules fc
            WHERE fc.face_key = fd.face_key
              AND fc.obligation_type = fob.obligation_type
          ),
          'resolution_rules', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'terminal_action',      frr.terminal_action,
                'proof_state',          frr.proof_state,
                'receipt_type',         frr.receipt_type,
                'reason_code_required', frr.reason_code_required,
                'proof_ref_required',   frr.proof_ref_required
              )
              ORDER BY frr.terminal_action
            )
            FROM registry.face_resolution_rules frr
            WHERE frr.face_key = fd.face_key
              AND frr.obligation_type = fob.obligation_type
          )
        )
        ORDER BY fob.is_active DESC, fob.obligation_type
      )
      FROM registry.face_obligation_rules fob
      WHERE fob.face_key = fd.face_key
    ),

    'receipt_requirements', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'receipt_type',   frq.receipt_type,
          'required_field', frq.required_field,
          'requirement',    frq.requirement
        )
        ORDER BY frq.receipt_type, frq.required_field
      )
      FROM registry.face_receipt_requirements frq
      WHERE frq.face_key = fd.face_key
    )
  )
  FROM registry.face_definitions fd
  WHERE fd.face_key = p_face_key;
$$;

REVOKE ALL ON FUNCTION api.get_face_contract(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.get_face_contract(text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 8. core.v_face001_contract_summary
--    Flat denormalized view of the Face #001 contract.
--    Joins event rules → obligation rules → command rules
--    into one queryable surface.
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW core.v_face001_contract_summary AS
SELECT
  fer.face_key,
  fer.source_event_key,
  fer.canonical_event_type,
  fer.object_class,
  fer.obligation_type,

  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'command_type',       fc.command_type,
        'display_label',      fc.display_label,
        'requires_note',      fc.requires_note,
        'requires_proof_ref', fc.requires_proof_ref,
        'is_terminal',        fc.is_terminal
      )
      ORDER BY fc.is_terminal, fc.command_type
    )
    FROM registry.face_command_rules fc
    WHERE fc.face_key = fer.face_key
      AND fc.obligation_type = fer.obligation_type
  ) AS allowed_commands,

  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'terminal_action',      frr.terminal_action,
        'proof_state',          frr.proof_state,
        'receipt_type',         frr.receipt_type,
        'reason_code_required', frr.reason_code_required,
        'proof_ref_required',   frr.proof_ref_required
      )
      ORDER BY frr.terminal_action
    )
    FROM registry.face_resolution_rules frr
    WHERE frr.face_key = fer.face_key
      AND frr.obligation_type = fer.obligation_type
  ) AS allowed_terminal_actions,

  fer.is_deferred,
  fer.deferred_reason,
  fob.kernel_class,
  fob.economic_posture,
  fob.display_label   AS obligation_display_label,
  fob.is_active       AS obligation_is_active

FROM registry.face_event_rules fer
JOIN registry.face_obligation_rules fob
  ON fob.face_key        = fer.face_key
 AND fob.obligation_type = fer.obligation_type
WHERE fer.face_key = 'stripe_billing_revenue_enforcement'
ORDER BY fer.is_deferred, fer.source_event_key;

GRANT SELECT ON core.v_face001_contract_summary
  TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 9. Register face contract event type
-- ---------------------------------------------------------------

INSERT INTO registry.event_types (family, name, description)
VALUES (
  'face',
  'face.contract.activated',
  'Face contract activated and its registry tables seeded'
)
ON CONFLICT (name) DO NOTHING;

COMMIT;
