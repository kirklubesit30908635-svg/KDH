export type MachineObject = {
  id: string
  kernel_class: string
  economic_posture: string
  status: string
  source_ref: string | null
  acknowledged_at: string
}

export type MachineObligation = {
  id: string
  object_id: string
  obligation_type: string
  state: string
  opened_at: string
  terminal_action: string | null
  terminal_reason_code: string | null
  metadata: Record<string, unknown> | null
}

export type MachineEvent = {
  id: number
  object_id: string | null
  obligation_id: string | null
  event_type: string
  actor_class: string
  actor_id: string
  occurred_at: string
  payload: Record<string, unknown> | null
}

export type MachineReceipt = {
  id: string
  object_id: string
  obligation_id: string | null
  receipt_type: string
  actor_class: string
  actor_id: string
  reason_code: string | null
  issued_at: string
}

export type MachineState = {
  workspaceId: string
  actorId: string
  mode: "founder_console"
  objects: MachineObject[]
  obligations: MachineObligation[]
  events: MachineEvent[]
  receipts: MachineReceipt[]
  metrics: {
    objects: number
    openObligations: number
    resolvedObligations: number
    events: number
    receipts: number
    staleObligations: number
  }
}

export type MachineHealth = {
  workspaceId: string
  checks: {
    governedClassPostureMatrixPresent: boolean
    resolvedObligationsCarryTerminalData: boolean
    receiptsDoNotExceedEvents: boolean
    noResolvedObligationWithoutActor: boolean
    noResolvedObligationWithoutTimestamp: boolean
  }
}
