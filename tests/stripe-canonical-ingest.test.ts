import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalStripeEventType,
  resolveStripeProviderAccountId,
} from "../src/lib/stripe-canonical-ingest";

// ── canonicalStripeEventType ──────────────────────────────────────────────────

test("canonicalStripeEventType: adds stripe. prefix when missing", () => {
  assert.equal(canonicalStripeEventType("invoice.paid"), "stripe.invoice.paid");
});

test("canonicalStripeEventType: keeps existing stripe. prefix unchanged", () => {
  assert.equal(canonicalStripeEventType("stripe.invoice.paid"), "stripe.invoice.paid");
});

test("canonicalStripeEventType: adds prefix for charge events", () => {
  assert.equal(
    canonicalStripeEventType("charge.dispute.created"),
    "stripe.charge.dispute.created",
  );
});

test("canonicalStripeEventType: handles already-prefixed charge event", () => {
  assert.equal(
    canonicalStripeEventType("stripe.charge.refunded"),
    "stripe.charge.refunded",
  );
});

test("canonicalStripeEventType: does not double-prefix", () => {
  const result = canonicalStripeEventType("stripe.invoice.payment_failed");
  assert.equal(result, "stripe.invoice.payment_failed");
  assert.ok(!result.startsWith("stripe.stripe."));
});

// ── resolveStripeProviderAccountId ────────────────────────────────────────────

test("resolveStripeProviderAccountId: returns event.account when it is a non-empty string", () => {
  const result = resolveStripeProviderAccountId({ account: "acct_event123" });
  assert.equal(result, "acct_event123");
});

test("resolveStripeProviderAccountId: falls back to STRIPE_ACCOUNT_ID when event.account is undefined", () => {
  const saved = process.env.STRIPE_ACCOUNT_ID;
  process.env.STRIPE_ACCOUNT_ID = "acct_env456";
  try {
    const result = resolveStripeProviderAccountId({ account: undefined });
    assert.equal(result, "acct_env456");
  } finally {
    if (saved === undefined) {
      delete process.env.STRIPE_ACCOUNT_ID;
    } else {
      process.env.STRIPE_ACCOUNT_ID = saved;
    }
  }
});

test("resolveStripeProviderAccountId: falls back to STRIPE_ACCOUNT_ID when event.account is null", () => {
  const saved = process.env.STRIPE_ACCOUNT_ID;
  process.env.STRIPE_ACCOUNT_ID = "acct_env789";
  try {
    const result = resolveStripeProviderAccountId({ account: null as unknown as undefined });
    assert.equal(result, "acct_env789");
  } finally {
    if (saved === undefined) {
      delete process.env.STRIPE_ACCOUNT_ID;
    } else {
      process.env.STRIPE_ACCOUNT_ID = saved;
    }
  }
});

test("resolveStripeProviderAccountId: falls back to env var when event.account is empty string", () => {
  const saved = process.env.STRIPE_ACCOUNT_ID;
  process.env.STRIPE_ACCOUNT_ID = "acct_envABC";
  try {
    const result = resolveStripeProviderAccountId({ account: "" as unknown as undefined });
    assert.equal(result, "acct_envABC");
  } finally {
    if (saved === undefined) {
      delete process.env.STRIPE_ACCOUNT_ID;
    } else {
      process.env.STRIPE_ACCOUNT_ID = saved;
    }
  }
});

test("resolveStripeProviderAccountId: throws when both event.account and env var are absent", () => {
  const saved = process.env.STRIPE_ACCOUNT_ID;
  delete process.env.STRIPE_ACCOUNT_ID;
  try {
    assert.throws(
      () => resolveStripeProviderAccountId({ account: undefined }),
      /Missing STRIPE_ACCOUNT_ID and Stripe event\.account/,
    );
  } finally {
    if (saved !== undefined) {
      process.env.STRIPE_ACCOUNT_ID = saved;
    }
  }
});

test("resolveStripeProviderAccountId: event.account takes precedence over env var", () => {
  const saved = process.env.STRIPE_ACCOUNT_ID;
  process.env.STRIPE_ACCOUNT_ID = "acct_should_not_use";
  try {
    const result = resolveStripeProviderAccountId({ account: "acct_preferred" });
    assert.equal(result, "acct_preferred");
  } finally {
    if (saved === undefined) {
      delete process.env.STRIPE_ACCOUNT_ID;
    } else {
      process.env.STRIPE_ACCOUNT_ID = saved;
    }
  }
});
