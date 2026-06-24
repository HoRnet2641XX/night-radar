import { readFile } from 'node:fs/promises'
import path from 'node:path'

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

function parseBbsSourceRows(sql) {
  const insertStart = sql.indexOf('insert into public.bbs_sources')
  if (insertStart < 0) return []

  const statement = sql.slice(insertStart, sql.indexOf('on conflict', insertStart))
  const rowPattern =
    /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(true|false),\s*(\d+),\s*'([^']+)'\)/g

  return [...statement.matchAll(rowPattern)].map((match) => ({
    id: match[1],
    store_id: match[2],
    label: match[3],
    url: match[4],
    parser_type: match[5],
    active: match[6] === 'true',
    crawl_interval_minutes: Number(match[7]),
    last_status: match[8],
  }))
}

async function upsertRows({ supabaseUrl, serviceRoleKey, table, rows, onConflict }) {
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`
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

await loadDotEnv(path.join(process.cwd(), '.env.local'))

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const seedPath = process.argv[2] ?? path.join(process.cwd(), 'supabase/seed-store-catalog.sql')
const seedSql = await readFile(seedPath, 'utf8')
const rows = parseBbsSourceRows(seedSql)
if (!rows.length) throw new Error(`No BBS source rows found in ${seedPath}`)

await upsertRows({
  supabaseUrl,
  serviceRoleKey,
  table: 'bbs_sources',
  rows,
  onConflict: 'store_id,url',
})

console.log(
  JSON.stringify(
    {
      bbsSources: rows.length,
      seedPath,
    },
    null,
    2,
  ),
)
