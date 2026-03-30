# Operator Watchdog

## Purpose

`/api/command/watchdog` is the governed watchdog surface for the live operator runtime.

It does two things:

- `GET` reads the current trigger set from the authoritative operator summary plus the governed queue.
- `POST` runs the workspace watchdog and records typed watchdog signal events for late or at-risk live obligations.

## Doctrine

- The watchdog does not resolve obligations.
- The watchdog does not emit receipts.
- The watchdog records pressure through canonical ledger events only.
- Proof lag and hidden-duty inconsistency are surfaced from the authoritative read contract until a dedicated doctrine for follow-up duties is promoted.

## Current trigger kinds

- `late_obligation`
- `at_risk_obligation`
- `proof_lag`
- `inconsistency`

Only `late_obligation` and `at_risk_obligation` currently emit typed watchdog signal events through the database runtime.

## Runtime write path

The database runtime adds:

- `api.record_obligation_watchdog_signal(...)`
- `api.run_workspace_watchdog(...)`

`api.run_workspace_watchdog(...)` evaluates the current visible operator queue for a workspace and records idempotent `obligation.watchdog_signal` ledger events for:

- late obligations
- at-risk obligations

## UI boundary

React consumes the watchdog contract only. It must not derive trigger kinds or escalation rules locally.

Current consumer:

- `/command/integrity`

Client helper:

- [src/lib/operator-watchdog-client.ts](C:/Users/chase kirk/autokirk-kernel/src/lib/operator-watchdog-client.ts)
