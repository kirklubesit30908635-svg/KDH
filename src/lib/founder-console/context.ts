export function getFounderContext() {
  const workspaceId = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID || ""
  const actorId = process.env.NEXT_PUBLIC_DEFAULT_ACTOR_ID || "founder"

  if (!workspaceId) {
    throw new Error("Missing NEXT_PUBLIC_DEFAULT_WORKSPACE_ID")
  }

  return {
    workspaceId,
    actorId,
    mode: "founder_console" as const,
  }
}
