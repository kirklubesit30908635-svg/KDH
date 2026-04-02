require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function getSingleRow(data) {
  if (Array.isArray(data)) {
    return data[0] ?? null
  }

  return data ?? null
}

async function run() {
  console.log('Fetching broken obligations...')

  const { data: rows, error } = await supabase
    .schema('core')
    .from('obligations')
    .select(
      'id, workspace_id, object_id, obligation_type, resolved_at, resolved_by_actor_class, resolved_by_actor_id, terminal_action, terminal_reason_code, metadata'
    )
    .eq('state', 'resolved')
    .is('receipt_id', null)

  if (error) {
    console.error('Fetch error:', error)
    process.exit(1)
  }

  console.log(`Found ${rows.length} broken obligations`)

  let linked = 0
  let failed = 0

  for (const row of rows) {
    const payload = {
      obligation_id: row.id,
      object_id: row.object_id,
      terminal_action: row.terminal_action,
      reason_code: row.terminal_reason_code,
      resolved_at: row.resolved_at,
      actor_class: row.resolved_by_actor_class ?? 'system',
      actor_id: row.resolved_by_actor_id ?? 'legacy-backfill',
      metadata: row.metadata ?? {},
    }

    const chainKey = `obligation:${row.id}`
    const eventKey = `obligation.resolved:${row.id}`
    const receiptKey = `obligation.proof:${row.id}`

    const { data: eventData, error: eventError } = await supabase
      .schema('api')
      .rpc('append_event', {
        p_workspace_id: row.workspace_id,
        p_chain_key: chainKey,
        p_event_type: 'obligation.resolved',
        p_payload: payload,
        p_idempotency_key: eventKey,
      })

    if (eventError) {
      failed += 1
      console.error('Failed event:', row.id, eventError.message)
      continue
    }

    const eventRow = getSingleRow(eventData)
    const eventId = eventRow?.event_id

    if (!eventId) {
      failed += 1
      console.error('Failed event:', row.id, 'append_event returned no event_id')
      continue
    }

    const { data: receiptData, error: receiptError } = await supabase
      .schema('api')
      .rpc('emit_receipt', {
        p_workspace_id: row.workspace_id,
        p_event_id: eventId,
        p_chain_key: chainKey,
        p_receipt_type: 'commit',
        p_payload: payload,
        p_idempotency_key: receiptKey,
      })

    if (receiptError) {
      failed += 1
      console.error('Failed receipt:', row.id, receiptError.message)
      continue
    }

    const receiptRow = getSingleRow(receiptData)
    const receiptId = receiptRow?.receipt_id

    if (!receiptId) {
      failed += 1
      console.error('Failed receipt:', row.id, 'emit_receipt returned no receipt_id')
      continue
    }

    const { data: verifyRows, error: verifyError } = await supabase
      .schema('core')
      .from('obligations')
      .select('receipt_id')
      .eq('id', row.id)
      .limit(1)

    if (verifyError) {
      failed += 1
      console.error('Failed verify:', row.id, verifyError.message)
      continue
    }

    const linkedReceiptId = verifyRows?.[0]?.receipt_id

    if (linkedReceiptId === receiptId) {
      linked += 1
      console.log('Linked:', row.id, '->', receiptId)
    } else {
      const { error: updateError } = await supabase
        .schema('core')
        .from('obligations')
        .update({
          receipt_id: receiptId,
          proof_state: 'linked',
          proof_strength: 'kernel_receipt',
          linked_at: row.resolved_at ?? new Date().toISOString(),
          proof_note: null,
        })
        .eq('id', row.id)
        .is('receipt_id', null)

      if (updateError) {
        failed += 1
        console.error('Failed link:', row.id, updateError.message)
        continue
      }

      linked += 1
      console.log('Linked:', row.id, '->', receiptId)
    }
  }

  console.log('\nDone.')
  console.log('Linked:', linked)
  console.log('Failed:', failed)

  const { count, error: remainingError } = await supabase
    .schema('core')
    .from('obligations')
    .select('id', { count: 'exact', head: true })
    .eq('state', 'resolved')
    .is('receipt_id', null)

  if (remainingError) {
    console.error('Remaining count check failed:', remainingError.message)
    process.exit(1)
  }

  console.log('Remaining broken:', count ?? 'check manually')
}

run().catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
