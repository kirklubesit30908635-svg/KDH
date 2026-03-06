-- =============================================================
-- 0004_registry.sql
-- registry schema: event_types and receipt_types catalogues
-- with seed data.
-- =============================================================

CREATE TABLE registry.event_types (
  id          serial      PRIMARY KEY,
  family      text        NOT NULL,
  name        text        NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE registry.receipt_types (
  id          serial      PRIMARY KEY,
  name        text        NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---- Seed: 26 event types across 12 families ----------------

INSERT INTO registry.event_types (family, name, description) VALUES
  -- 1. system
  ('system',       'system.booted',              'Kernel bootstrap completed'),
  ('system',       'system.shutdown',             'Kernel shutdown initiated'),
  -- 2. auth
  ('auth',         'auth.login',                  'Operator authenticated'),
  ('auth',         'auth.logout',                 'Operator session terminated'),
  -- 3. workflow
  ('workflow',     'workflow.started',             'Workflow instance started'),
  ('workflow',     'workflow.completed',           'Workflow instance completed'),
  ('workflow',     'workflow.failed',              'Workflow instance failed'),
  -- 4. task
  ('task',         'task.enqueued',               'Task placed in queue'),
  ('task',         'task.executed',               'Task execution completed'),
  ('task',         'task.failed',                 'Task execution failed'),
  -- 5. agent
  ('agent',        'agent.invoked',               'Agent invocation triggered'),
  ('agent',        'agent.responded',             'Agent produced a response'),
  -- 6. tool
  ('tool',         'tool.called',                 'Tool call initiated'),
  ('tool',         'tool.returned',               'Tool call returned a result'),
  -- 7. ingest
  ('ingest',       'ingest.received',             'Raw event received from source'),
  ('ingest',       'ingest.trusted',              'Raw event promoted to trusted'),
  -- 8. ledger
  ('ledger',       'ledger.appended',             'Event appended to ledger chain'),
  ('ledger',       'ledger.chain_created',        'New ledger chain initialised'),
  -- 9. receipt
  ('receipt',      'receipt.issued',              'Receipt issued for an event'),
  -- 10. notification
  ('notification', 'notification.sent',           'Notification dispatched'),
  ('notification', 'notification.failed',         'Notification delivery failed'),
  -- 11. audit
  ('audit',        'audit.accessed',              'Resource access recorded'),
  ('audit',        'audit.modified',              'Resource modification recorded'),
  -- 12. integration
  ('integration',  'integration.connected',       'External integration connected'),
  ('integration',  'integration.synced',          'External integration sync completed');

-- ---- Seed: 4 receipt types ----------------------------------

INSERT INTO registry.receipt_types (name, description) VALUES
  ('ack',    'Positive acknowledgment — event accepted and processed'),
  ('nack',   'Negative acknowledgment — event rejected, retry eligible'),
  ('error',  'Processing error — event failed, not retry eligible'),
  ('commit', 'Commit confirmation — durable side-effect recorded');
