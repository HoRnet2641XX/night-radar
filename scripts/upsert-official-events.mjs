import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

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

function nextMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

async function pruneGeneratedEvents(supabase, events, applyChanges) {
  const scopes = new Map()
  for (const event of events) {
    const month = event.date.slice(0, 7)
    const key = `${event.storeId}|${month}`
    const scope = scopes.get(key) ?? {
      storeId: event.storeId,
      month,
      ids: new Set(),
      sourceUrls: new Set(),
    }
    scope.ids.add(event.id)
    if (event.sourceUrl) scope.sourceUrls.add(event.sourceUrl)
    scopes.set(key, scope)
  }

  let deleted = 0
  for (const scope of scopes.values()) {
    if (!scope.sourceUrls.size) continue
    const { data, error } = await supabase
      .from('events')
      .select('id,source_url')
      .eq('store_id', scope.storeId)
      .gte('date_label', `${scope.month}-01`)
      .lt('date_label', `${nextMonth(scope.month)}-01`)
      .in('source_url', [...scope.sourceUrls])
    if (error) throw new Error(`events prune lookup failed: ${error.message}`)

    const staleIds = (data ?? []).map((row) => row.id).filter((id) => !scope.ids.has(id))
    for (let index = 0; index < staleIds.length; index += 100) {
      const chunk = staleIds.slice(index, index + 100)
      if (applyChanges) {
        const { error: deleteError } = await supabase.from('events').delete().in('id', chunk)
        if (deleteError) throw new Error(`events prune failed: ${deleteError.message}`)
      }
      deleted += chunk.length
    }
  }
  return deleted
}

await loadDotEnv(path.join(process.cwd(), '.env.local'))

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const prune = process.argv.includes('--prune')
const dryRun = process.argv.includes('--dry-run')
const eventsPath = process.argv.slice(2).find((argument) => !argument.startsWith('--')) ?? path.join(process.cwd(), 'src/lib/official-events.generated.json')
const events = JSON.parse(await readFile(eventsPath, 'utf8'))
const client = { supabaseUrl, serviceRoleKey }
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let detailsPersisted = true
if (!dryRun) {
  try {
    await upsertEvents(client, events, true)
  } catch (error) {
    if (!String(error?.message ?? error).includes('details')) throw error
    detailsPersisted = false
    await upsertEvents(client, events, false)
  }
}

const prunedEvents = prune ? await pruneGeneratedEvents(supabase, events, !dryRun) : 0

console.log(
  JSON.stringify(
    {
      mode: dryRun ? 'dry-run' : 'apply',
      events: events.length,
      prunedEvents,
      detailsPersisted,
    },
    null,
    2,
  ),
)
