export function debugRoutesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.DEBUG_ROUTES_ENABLED === "true";
}
