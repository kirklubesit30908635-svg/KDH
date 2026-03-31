# Investor Validation Memo

Date: 2026-03-30
Branch: `codex/allaround-best`
Commit: `91be431`

## Executive Summary

AutoKirk currently validates as a clean, buildable, test-passing revenue-enforcement application with a narrowly scoped Stripe billing wedge.

The current branch demonstrates:

- a governed operator runtime with command, receipts, integrity, login, and webhook surfaces
- deterministic event-to-obligation mapping for the supported Stripe wedge
- explicit exclusion of unratified subscription-lifecycle behavior from the supported wedge
- clean production build output
- full repository test pass on this branch

## Commands Run

### Full repository test suite

```bash
npm test
```

Result:

- `171/171` tests passing

### Focused wedge capability suite

```bash
npx tsx --test tests/stripe-obligations.test.ts tests/stripe-first-wedge-contract.test.ts tests/stripe-first-wedge-closure.test.ts
```

Result:

- `93/93` tests passing

### Production build

```bash
npm run build
```

Result:

- Next.js production build completed successfully
- Generated routes include:
  - `/`
  - `/login`
  - `/command`
  - `/command/integrity`
  - `/command/receipts`
  - `/api/command/feed`
  - `/api/command/seal`
  - `/api/integrity/stats`
  - `/api/receipts/feed`
  - `/api/stripe/webhook`
  - `/auth/callback`

### Live local smoke test

```bash
npm start -- --port 3100
```

Then validated:

- `GET /login` -> `200`
- `GET /command` -> `200`
- `GET /` -> `307` redirect
- `GET /api/integrity/stats` -> `401` unauthenticated as expected
- `GET /api/receipts/feed` -> `401` unauthenticated as expected

Browser validation on `/login`:

- page title: `AutoKirk — Revenue Integrity Operating Layer`
- operator entry page renders with command, receipts, and integrity navigation visible

The only browser-console errors during this smoke test were the expected unauthenticated `401` fetches against protected API routes.

## What Has Been Proven

### 1. Supported Stripe billing events map into governed obligations

Validated in:

- `tests/stripe-obligations.test.ts`
- `src/lib/stripe-obligations.ts`
- `src/lib/stripe_first_wedge_contract.ts`

Supported movements currently proven by tests:

- `invoice.paid`
- `invoice.payment_failed`
- `charge.dispute.created`
- `charge.refunded`

Examples of proven behavior:

- `invoice.paid` creates a supported `record_revenue` obligation
- `invoice.payment_failed` creates a supported `recover_payment` obligation
- `charge.dispute.created` creates a supported `respond_to_dispute` obligation
- `charge.refunded` creates a supported `process_refund` obligation

### 2. Unsupported subscription lifecycle behavior is explicitly deferred

Validated in:

- `tests/stripe-first-wedge-contract.test.ts`
- `tests/stripe-obligations.test.ts`
- `tests/stripe-first-wedge-closure.test.ts`

Explicitly deferred:

- `customer.subscription.created`
- `customer.subscription.deleted`

This matters for investor diligence because the system is not claiming broader lifecycle automation than it has actually ratified.

### 3. The operator runtime is intentionally constrained and test-covered

Validated in:

- `tests/stripe-first-wedge-closure.test.ts`

Proven properties:

- supported operator wedge surfaces remain open
- deferred and dead surfaces remain closed
- root route is redirect-only, not a misleading marketing page
- integrity reads from the wedge-specific summary path

### 4. The branch is clean and aligned

Git status at validation time:

- branch clean
- branch tracked as `origin/codex/allaround-best`

This means the validation memo refers to a concrete, reproducible code state.

## Investor Interpretation

The strongest present proof is not broad platform breadth; it is disciplined execution of a narrow, defensible operating loop:

1. Stripe billing movement arrives
2. AutoKirk classifies whether that movement is supported, deferred, or unsupported
3. Supported movements map into governed obligations
4. Operators act through command surfaces
5. Receipts and integrity surfaces exist as first-class runtime outputs

That is a stronger diligence story than claiming a larger automation surface that is not yet stable.

## Current Limitation

This memo proves code quality, product buildability, and validated behavior on the current branch.

It does **not** by itself prove live production revenue throughput, customer adoption, or live Stripe-account ingestion under a configured production provider connection. Those need separate environment-level and business-level diligence artifacts.
