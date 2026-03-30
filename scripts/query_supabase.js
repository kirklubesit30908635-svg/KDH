const SUPABASE = 'https://udwzexjwhkvsyeihcwfw.supabase.co/rest/v1'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd3pleGp3aGt2c3llaWhjd2Z3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwMTgxOSwiZXhwIjoyMDg4MTc3ODE5fQ.tdNjjX61XGfDQ1EzcR6jWo-BZHfOQ1Xj2UEUFP7FnEw'

const headersBase = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
}

async function getCount(path){
  // Use quoted schema.table to avoid PostgREST interpreting the dot as part of the table name
  const quoted = `"${path.replace('.', '"."')}"`
  const url = `${SUPABASE}/${encodeURIComponent(quoted)}?select=id&limit=0`
  const res = await fetch(url, { headers: { ...headersBase, Prefer: 'count=exact' } })
  const cr = res.headers.get('content-range') || res.headers.get('Content-Range')
  return cr || null
}

async function getLatest(path, select){
  const quoted = `"${path.replace('.', '"."')}"`
  const url = `${SUPABASE}/${encodeURIComponent(quoted)}?select=${encodeURIComponent(select)}&order=created_at.desc&limit=10`
  const res = await fetch(url, { headers: headersBase })
  return res.json()
}

async function getStatuses(){
  const quoted = `"${'core.obligations'.replace('.', '"."')}"`
  const url = `${SUPABASE}/${encodeURIComponent(quoted)}?select=status&limit=1000`
  const res = await fetch(url, { headers: headersBase })
  return res.json()
}

async function run(){
  console.log('=== Obligation count (content-range) ===')
  console.log(await getCount('core.obligations'))

  console.log('\n=== Latest obligations (id, status, created_at) ===')
  console.log(JSON.stringify(await getLatest('core.obligations', 'id,status,created_at'), null, 2))

  console.log('\n=== Obligation status distribution ===')
  const statuses = await getStatuses()
  const dist = statuses.reduce((acc, r) => { acc[r.status] = (acc[r.status]||0)+1; return acc }, {})
  console.log(JSON.stringify(dist, null, 2))

  console.log('\n=== Receipt count (content-range) ===')
  console.log(await getCount('ledger.receipts'))

  console.log('\n=== Latest receipts (id, created_at) ===')
  console.log(JSON.stringify(await getLatest('ledger.receipts', 'id,created_at'), null, 2))
}

run().catch(e=>{ console.error(e); process.exit(1) })
