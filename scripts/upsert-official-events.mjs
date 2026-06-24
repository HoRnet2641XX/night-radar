import { readFile } from 'node:fs/promises'
import path from 'node:path'

const storeRows = [
  { id: 'collabo', name: 'collabo' },
  { id: 'honey-trap', name: 'HONEY TRAP' },
  { id: 'bar-rusk', name: 'BAR RUSK' },
  { id: 'papillon', name: 'Papillon' },
  { id: 'harnes-tokyo', name: 'HARNES TOKYO' },
  { id: 'bar-face', name: 'BAR FACE' },
  { id: 'campo-bar', name: 'CAMPO BAR' },
  { id: 'arabesque', name: 'ARABESQUE' },
  { id: 'colors-bar', name: 'COLORS BAR' },
  { id: 'bar440', name: 'BAR440' },
  { id: 'voluptuous', name: 'Voluptuous' },
  { id: 'retreat-bar', name: 'RETREAT BAR' },
  { id: 'agreeable', name: 'AgreeAble' },
  { id: 'ouvea', name: 'Ouvea' },
  { id: 'secret-bar-silent-moon', name: 'Secret Bar Silent Moon' },
  { id: 'bar-spear', name: 'BAR SPEAR' },
  { id: 'bar-canelo', name: 'BAR CANELO' },
  { id: 'b-dash', name: 'B-DASH' },
  { id: 'ogikubo-himitsu-club', name: '荻窪秘密倶楽部' },
  { id: 'club-zeus', name: 'CLUB ZEUS' },
  { id: 'land-land', name: 'land land' },
  { id: 'filt-shibuya', name: 'FILT SHIBUYA' },
  { id: 'communicationbar-sango', name: 'Communicationbar 珊瑚' },
  { id: 'off-white', name: 'Off White' },
].map((store) => ({
  ...store,
  area: '都内',
  has_daytime: true,
  has_night: true,
  opening_hour_day: '13:00',
  opening_hour_night: '19:00',
  pr_structure: '公式イベント観測',
  trust_seed: 60,
}))

async function loadDotEnv(file) {
  const text = await readFile(file, 'utf8').catch(() => '')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key && process.env[key] == null) process.env[key] = value
  }
}

function eventRow(event, includeDetails = true) {
  const row = {
    id: event.id,
    store_id: event.storeId,
    date_label: event.date,
    weekday: event.weekday,
    starts_at: event.startsAt,
    session: event.session,
    category: event.category,
    title: event.title,
    source_url: event.sourceUrl || null,
  }
  if (includeDetails) row.details = event.details || ''
  return row
}

async function upsertRows({ supabaseUrl, serviceRoleKey, table, rows }) {
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}?on_conflict=id`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${table} upsert failed: ${response.status} ${body}`)
  }
}

async function upsertEvents(client, rows, includeDetails) {
  for (let index = 0; index < rows.length; index += 100) {
    const chunk = rows.slice(index, index + 100).map((event) => eventRow(event, includeDetails))
    await upsertRows({ ...client, table: 'events', rows: chunk })
  }
}

await loadDotEnv(path.join(process.cwd(), '.env.local'))

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const eventsPath = process.argv[2] ?? path.join(process.cwd(), 'src/lib/official-events.generated.json')
const events = JSON.parse(await readFile(eventsPath, 'utf8'))
const client = { supabaseUrl, serviceRoleKey }

await upsertRows({ ...client, table: 'stores', rows: storeRows })

let detailsPersisted = true
try {
  await upsertEvents(client, events, true)
} catch (error) {
  if (!String(error?.message ?? error).includes('details')) throw error
  detailsPersisted = false
  await upsertEvents(client, events, false)
}

console.log(
  JSON.stringify(
    {
      stores: storeRows.length,
      events: events.length,
      detailsPersisted,
    },
    null,
    2,
  ),
)
