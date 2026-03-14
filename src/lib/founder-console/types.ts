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
  id: string
  chain_key: string
  seq: number
  event_type_id: number
  payload: Record<string, unknown> | null
  created_at: string
}

export type MachineReceipt = {
  id: string
  event_id: string
  receipt_type_id: number
  chain_key: string
  seq: number
  created_at: string
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
