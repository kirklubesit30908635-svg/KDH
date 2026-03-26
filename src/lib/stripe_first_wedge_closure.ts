export type WedgeSurfaceClassification =
  | "supported"
  | "deferred"
  | "dead";

export type WedgeRouteGateDecision = {
  classification: WedgeSurfaceClassification | null;
  reason: string | null;
  status: 409 | 410 | null;
  source: "mutation" | "projection" | null;
};

type WedgeMutationPath = {
  path: string;
  method: "GET" | "POST" | "PATCH";
  classification: WedgeSurfaceClassification;
  reason: string;
};

type WedgeProjectionKind = "page" | "api" | "view";

type WedgeProjection = {
  path: string;
  kind: WedgeProjectionKind;
  classification: WedgeSurfaceClassification;
  reason: string;
};

const mutationPaths = [
  {
    path: "/auth/callback",
    method: "GET",
    classification: "supported",
    reason: "Required to establish the authenticated operator session and first-login operator row.",
  },
  {
    path: "/api/stripe/webhook",
    method: "POST",
    classification: "supported",
    reason: "Authoritative Stripe ingress for the frozen billing wedge.",
  },
  {
    path: "/api/command/seal",
    method: "POST",
    classification: "supported",
    reason: "The only live operator mutation path for wedge obligation resolution.",
  },
  {
    path: "/api/command/touch",
    method: "POST",
    classification: "deferred",
    reason: "Acknowledged-state handling exists in the contract but is not promoted into the live operator wedge.",
  },
  {
    path: "/api/stripe/checkout",
    method: "POST",
    classification: "deferred",
    reason: "Subscription and checkout flows are outside the frozen Stripe billing wedge.",
  },
  {
    path: "/api/stripe/portal",
    method: "POST",
    classification: "deferred",
    reason: "Subscription portal mutations are outside the frozen Stripe billing wedge.",
  },
  {
    path: "/api/access/tenant",
    method: "GET",
    classification: "deferred",
    reason: "Access entitlement lookup only exists for the deferred subscription flow.",
  },
  {
    path: "/api/founder/acknowledge-object",
    method: "POST",
    classification: "dead",
    reason: "Founder-side direct kernel mutation is a side-door write and violates the frozen wedge boundary.",
  },
  {
    path: "/api/founder/open-obligation",
    method: "POST",
    classification: "dead",
    reason: "Founder-side direct obligation mutation is outside the governed operator wedge.",
  },
  {
    path: "/api/founder/resolve-obligation",
    method: "POST",
    classification: "dead",
    reason: "Founder-side direct resolution bypasses the live wedge action rail.",
  },
  {
    path: "/api/debug/inject-stripe",
    method: "POST",
    classification: "dead",
    reason: "Debug ingress must not exist in the frozen deployment boundary.",
  },
  {
    path: "/api/debug/bind-stripe",
    method: "POST",
    classification: "dead",
    reason: "Debug binding routes are not part of live operator deployment.",
  },
  {
    path: "/api/users/assign",
    method: "POST",
    classification: "dead",
    reason: "User and workspace administration is outside the first Stripe billing wedge.",
  },
  {
    path: "/api/users/workspace",
    method: "POST",
    classification: "dead",
    reason: "Workspace creation is outside the frozen wedge and currently over-broad in authority.",
  },
  {
    path: "/api/billing-ops/seal",
    method: "POST",
    classification: "dead",
    reason: "Duplicate billing mutation path; the supported mutation path is /api/command/seal.",
  },
  {
    path: "/api/washbay",
    method: "POST",
    classification: "dead",
    reason: "Washbay mutations are unrelated to the frozen Stripe billing wedge.",
  },
  {
    path: "/api/washbay/[id]",
    method: "PATCH",
    classification: "dead",
    reason: "Washbay mutations are unrelated to the frozen Stripe billing wedge.",
  },
] satisfies WedgeMutationPath[];

const operatorProjections = [
  {
    path: "/",
    kind: "page",
    classification: "supported",
    reason: "Redirect-only operator entry. Marketing no longer lives in this runtime.",
  },
  {
    path: "/command",
    kind: "page",
    classification: "supported",
    reason: "Primary operator queue for the frozen Stripe billing wedge.",
  },
  {
    path: "/command/receipts",
    kind: "page",
    classification: "supported",
    reason: "Primary proof surface for billing wedge resolution receipts.",
  },
  {
    path: "/command/integrity",
    kind: "page",
    classification: "supported",
    reason: "Primary wedge integrity surface.",
  },
  {
    path: "/login",
    kind: "page",
    classification: "supported",
    reason: "Operator entry surface for the frozen wedge.",
  },
  {
    path: "/api/command/feed",
    kind: "api",
    classification: "supported",
    reason: "Supported queue projection for live billing wedge obligations.",
  },
  {
    path: "/api/receipts/feed",
    kind: "api",
    classification: "supported",
    reason: "Supported receipt projection for live billing wedge proof.",
  },
  {
    path: "/api/integrity/stats",
    kind: "api",
    classification: "supported",
    reason: "Supported integrity projection for live billing wedge signals.",
  },
  {
    path: "core.v_operator_next_actions",
    kind: "view",
    classification: "supported",
    reason: "Canonical queue projection for the live operator wedge.",
  },
  {
    path: "core.v_recent_receipts",
    kind: "view",
    classification: "supported",
    reason: "Canonical receipt projection for the live operator wedge.",
  },
  {
    path: "core.v_stripe_first_wedge_integrity_summary",
    kind: "view",
    classification: "supported",
    reason: "Canonical wedge-specific integrity summary projection for the live operator runtime.",
  },
  {
    path: "/subscribe",
    kind: "page",
    classification: "deferred",
    reason: "Subscription and access setup are outside the frozen Stripe billing operator wedge.",
  },
  {
    path: "/reset-password",
    kind: "page",
    classification: "dead",
    reason: "Password reset does not belong in the paying-operator runtime for this wedge deployment.",
  },
  {
    path: "/founder/builder-costs",
    kind: "page",
    classification: "dead",
    reason: "Founder diagnostics are isolated out of the operator runtime.",
  },
  {
    path: "/api/founder/machine-state",
    kind: "api",
    classification: "dead",
    reason: "Founder diagnostics are isolated out of the operator runtime.",
  },
  {
    path: "/api/founder/machine-health",
    kind: "api",
    classification: "dead",
    reason: "Founder diagnostics are isolated out of the operator runtime.",
  },
  {
    path: "/api/founder/builder-costs-summary",
    kind: "api",
    classification: "dead",
    reason: "Founder diagnostics are isolated out of the operator runtime.",
  },
  {
    path: "/billing-ops",
    kind: "page",
    classification: "dead",
    reason: "Legacy billing face duplicate; the supported queue is /command.",
  },
  {
    path: "/founder",
    kind: "page",
    classification: "dead",
    reason: "Founder surfaces do not belong in the paying-operator runtime.",
  },
  {
    path: "/users",
    kind: "page",
    classification: "dead",
    reason: "User and workspace administration is outside the first wedge.",
  },
  {
    path: "/advertising",
    kind: "page",
    classification: "dead",
    reason: "Advertising operations are outside the first wedge.",
  },
  {
    path: "/washbay",
    kind: "page",
    classification: "dead",
    reason: "Washbay operations are outside the first wedge.",
  },
  {
    path: "/api/users/feed",
    kind: "api",
    classification: "dead",
    reason: "User and workspace admin read surface is outside the first wedge.",
  },
  {
    path: "/api/advertising/feed",
    kind: "api",
    classification: "dead",
    reason: "Advertising read surface is outside the first wedge.",
  },
  {
    path: "/api/billing-ops/feed",
    kind: "api",
    classification: "dead",
    reason: "Legacy billing queue duplicate; the supported queue is /api/command/feed.",
  },
  {
    path: "/api/billing-ops/stats",
    kind: "api",
    classification: "dead",
    reason: "Legacy billing stats duplicate; the supported integrity path is /api/integrity/stats.",
  },
  {
    path: "/api/system-state",
    kind: "api",
    classification: "dead",
    reason: "Public aggregated system-state read is outside the frozen boundary.",
  },
  {
    path: "/api/spine-test",
    kind: "api",
    classification: "dead",
    reason: "Test endpoints are not allowed in the frozen deployment boundary.",
  },
  {
    path: "/api/debug/tenants",
    kind: "api",
    classification: "dead",
    reason: "Debug read endpoints are not allowed in the frozen deployment boundary.",
  },
  {
    path: "/api/debug/stripe-events",
    kind: "api",
    classification: "dead",
    reason: "Debug read endpoints are not allowed in the frozen deployment boundary.",
  },
  {
    path: "/api/washbay",
    kind: "api",
    classification: "dead",
    reason: "Washbay read surfaces are outside the first wedge.",
  },
  {
    path: "core.v_next_actions",
    kind: "view",
    classification: "dead",
    reason: "Legacy operator action view superseded by core.v_operator_next_actions.",
  },
  {
    path: "core.v_receipts",
    kind: "view",
    classification: "dead",
    reason: "Legacy receipt view superseded by core.v_recent_receipts.",
  },
  {
    path: "core.v_integrity_summary",
    kind: "view",
    classification: "dead",
    reason: "Generic workspace integrity aggregation is not a valid operator projection for the frozen wedge.",
  },
  {
    path: "signals.v_integrity_summary",
    kind: "view",
    classification: "dead",
    reason: "Generic signal aggregation is internal residue and not part of the paying-operator wedge contract.",
  },
] satisfies WedgeProjection[];

export const stripe_first_wedge_closure = {
  name: "stripe_first_wedge_closure",
  wedge: "Frozen Stripe billing movement-to-receipt deployment boundary.",
  mutation_paths: mutationPaths,
  operator_projections: operatorProjections,
} as const;

function matchesPath(pattern: string, pathname: string) {
  if (pattern.includes("[id]")) {
    const prefix = pattern.split("[id]")[0];
    return pathname.startsWith(prefix) && pathname.length > prefix.length;
  }

  return pathname === pattern || pathname.startsWith(`${pattern}/`);
}

export function getStripeFirstWedgeMutationClassification(pathname: string, method: string) {
  const normalizedMethod = method.toUpperCase() as WedgeMutationPath["method"];
  return (
    stripe_first_wedge_closure.mutation_paths.find(
      (entry) => entry.method === normalizedMethod && matchesPath(entry.path, pathname),
    ) ?? null
  );
}

export function getStripeFirstWedgeProjectionClassification(pathname: string) {
  return (
    stripe_first_wedge_closure.operator_projections.find(
      (entry) => entry.kind !== "view" && matchesPath(entry.path, pathname),
    ) ?? null
  );
}

export function isWedgeProtectedPath(pathname: string) {
  return [
    "/command",
    "/command/receipts",
    "/command/integrity",
    "/billing-ops",
    "/users",
    "/advertising",
    "/washbay",
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function blockedSurfaceStatus(classification: WedgeSurfaceClassification) {
  if (classification === "deferred") return 409;
  if (classification === "dead") return 410;
  return null;
}

export function getStripeFirstWedgeRouteGate(
  pathname: string,
  method: string,
): WedgeRouteGateDecision {
  const mutation = getStripeFirstWedgeMutationClassification(pathname, method);
  if (mutation) {
    return {
      classification: mutation.classification,
      reason: mutation.reason,
      status: blockedSurfaceStatus(mutation.classification),
      source: "mutation",
    };
  }

  const projection = getStripeFirstWedgeProjectionClassification(pathname);
  if (projection) {
    return {
      classification: projection.classification,
      reason: projection.reason,
      status: blockedSurfaceStatus(projection.classification),
      source: "projection",
    };
  }

  return {
    classification: null,
    reason: null,
    status: null,
    source: null,
  };
}
