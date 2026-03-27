
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getStripeFirstWedgeRouteGate,
  remainingStripeFirstWedgeLegacyReadonlyPaths,
  stripe_first_wedge_closure,
} from "../src/lib/stripe_first_wedge_closure";
import {
  classifyStripeFirstWedgeSourceEvent,
  supportedStripeFirstWedgeObligationTypes,
} from "../src/lib/stripe_first_wedge_contract";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const removedDeadFiles = [
  "src/app/advertising/page.tsx",
  "src/app/users/page.tsx",
  "src/app/washbay/page.tsx",
  "src/app/founder/page.tsx",
  "src/app/reset-password/page.tsx",
  "src/app/founder/builder-costs/page.tsx",
  "src/app/api/advertising/feed/route.ts",
  "src/app/api/users/feed/route.ts",
  "src/app/api/users/assign/route.ts",
  "src/app/api/users/workspace/route.ts",
  "src/app/api/washbay/route.ts",
  "src/app/api/washbay/[id]/route.ts",
  "src/app/api/system-state/route.ts",
  "src/app/api/spine-test/route.ts",
  "src/app/api/founder/machine-state/route.ts",
  "src/app/api/founder/machine-health/route.ts",
  "src/app/api/founder/builder-costs-summary/route.ts",
  "src/app/api/debug/inject-stripe/route.ts",
  "src/app/api/debug/bind-stripe/route.ts",
  "src/app/api/debug/stripe-events/route.ts",
  "src/app/api/debug/tenants/route.ts",
  "src/app/api/founder/acknowledge-object/route.ts",
  "src/app/api/founder/open-obligation/route.ts",
  "src/app/api/founder/resolve-obligation/route.ts",
  "src/app/api/billing-ops/feed/route.ts",
  "src/app/api/billing-ops/stats/route.ts",
  "src/app/api/billing-ops/seal/route.ts",
  "src/components/founder-console/FounderConsole.tsx",
  "src/lib/founder-console/auth.ts",
  "src/lib/founder-console/context.ts",
  "src/lib/founder-console/server.ts",
  "src/lib/founder-console/types.ts",
  "src/lib/washbay-store.ts",
  "src/src/proxy.ts",
];

const removedDeferredFiles = [
  "src/app/subscribe/page.tsx",
  "src/app/api/command/touch/route.ts",
  "src/app/api/stripe/checkout/route.ts",
  "src/app/api/stripe/portal/route.ts",
  "src/app/api/access/tenant/route.ts",
];

test("supported operator wedge surfaces stay open", () => {
  const gate = getStripeFirstWedgeRouteGate("/command", "GET");
  assert.equal(gate.classification, "supported");
  assert.equal(gate.status, null);
  assert.equal(gate.source, "projection");
});

test("paid subscription operationalization is a supported wedge movement", () => {
  const contract = classifyStripeFirstWedgeSourceEvent("stripe.checkout.session.completed");

  assert.equal(contract.disposition, "supported");
  assert.equal(contract.row?.object_class, "subscription");
  assert.equal(contract.row?.obligation_type, "operationalize_subscription");
  assert.ok(supportedStripeFirstWedgeObligationTypes.includes("operationalize_subscription"));
});

test("deferred subscription lifecycle stays out of live wedge projection SQL", () => {
  const migration = readFileSync(
    path.join(
      repoRoot,
      "supabase/migrations/20260324170000_align_supported_wedge_projection_to_doctrine.sql",
    ),
    "utf8",
  );

  assert.match(
    migration,
    /subscription lifecycle semantics are deferred outside the frozen billing wedge/,
  );
  assert.match(
    migration,
    /if p_stripe_type = 'stripe\.checkout\.session\.completed' and v_event_id is not null then/,
  );
  assert.match(
    migration,
    /where et\.name in \(\s*'stripe\.checkout\.session\.completed'\s*\)/,
  );
  assert.doesNotMatch(
    migration,
    /if p_stripe_type in \(\s*'stripe\.checkout\.session\.completed',\s*'stripe\.customer\.subscription\.deleted'/,
  );
  assert.doesNotMatch(
    migration,
    /where et\.name in \(\s*'stripe\.checkout\.session\.completed',\s*'stripe\.customer\.subscription\.deleted'/,
  );
});

test("deferred surfaces stay explicitly closed", () => {
  const deferredMutations = stripe_first_wedge_closure.mutation_paths.filter(
    (entry) => entry.classification === "deferred",
  );
  const deferredProjections = stripe_first_wedge_closure.operator_projections.filter(
    (entry) => entry.classification === "deferred",
  );

  for (const entry of [...deferredMutations, ...deferredProjections]) {
    const method = "method" in entry ? entry.method : "GET";
    const gate = getStripeFirstWedgeRouteGate(entry.path, method);
    assert.equal(gate.classification, "deferred", `${entry.path} should remain deferred`);
    assert.equal(gate.status, 409, `${entry.path} should stay conflict-closed`);
  }
});

test("dead surfaces stay explicitly closed", () => {
  const deadMutations = stripe_first_wedge_closure.mutation_paths.filter(
    (entry) => entry.classification === "dead",
  );
  const deadHttpProjections = stripe_first_wedge_closure.operator_projections.filter(
    (entry) => entry.classification === "dead" && entry.kind !== "view",
  );
  const deadViewProjections = stripe_first_wedge_closure.operator_projections.filter(
    (entry) => entry.classification === "dead" && entry.kind === "view",
  );

  for (const entry of [...deadMutations, ...deadHttpProjections]) {
    const method = "method" in entry ? entry.method : "GET";
    const gate = getStripeFirstWedgeRouteGate(entry.path, method);
    assert.equal(gate.classification, "dead", `${entry.path} should remain dead`);
    assert.equal(gate.status, 410, `${entry.path} should stay gone-closed`);
  }

  assert.deepEqual(
    deadViewProjections.map((entry) => entry.path).sort(),
    [
      "core.v_integrity_summary",
      "core.v_next_actions",
      "core.v_receipts",
      "signals.v_integrity_summary",
    ],
  );
});

test("no legacy-readonly surfaces remain inside the operator runtime", () => {
  const paths = remainingStripeFirstWedgeLegacyReadonlyPaths.map((entry) => entry.path).sort();
  assert.deepEqual(paths, []);
});

test("dead files are physically deleted from the repo", () => {
  for (const relativePath of removedDeadFiles) {
    const fullPath = path.join(repoRoot, relativePath);
    assert.equal(existsSync(fullPath), false, `${relativePath} should be deleted`);
  }
});

test("deferred files are removed from the repo while their paths stay closed", () => {
  for (const relativePath of removedDeferredFiles) {
    const fullPath = path.join(repoRoot, relativePath);
    assert.equal(existsSync(fullPath), false, `${relativePath} should be removed`);
  }
});

test("root is redirect-only and no longer contains marketing content", () => {
  const rootPage = readFileSync(path.join(repoRoot, "src/app/page.tsx"), "utf8");

  assert.match(rootPage, /redirect\("\/login"\)/);
  assert.doesNotMatch(
    rootPage,
    /Service business|Donation flow|Grant \/ funding|Revenue accountability walkthrough/,
  );
});

test("layout metadata frames AutoKirk as revenue enforcement infrastructure", () => {
  const layout = readFileSync(path.join(repoRoot, "src/app/layout.tsx"), "utf8");
  const uiFmt = readFileSync(path.join(repoRoot, "src/lib/ui-fmt.ts"), "utf8");

  assert.match(layout, /REVENUE_ENFORCEMENT_CATEGORY/);
  assert.match(uiFmt, /export const REVENUE_ENFORCEMENT_CATEGORY = "Revenue Enforcement Infrastructure"/);
  assert.doesNotMatch(layout, /Revenue Integrity Operating Layer/);
  assert.doesNotMatch(uiFmt, /Revenue Integrity Operating Layer/);
});

test("integrity route reads from the wedge-specific summary view only", () => {
  const integrityRoute = readFileSync(
    path.join(repoRoot, "src/app/api/integrity/stats/route.ts"),
    "utf8",
  );

  assert.match(integrityRoute, /v_stripe_first_wedge_integrity_summary/);
  assert.doesNotMatch(integrityRoute, /\.from\("v_integrity_summary"\)/);
});

