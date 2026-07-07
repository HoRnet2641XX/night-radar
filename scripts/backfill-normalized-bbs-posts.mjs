import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { extractNormalizedBbsPostsFromText } from '../src/lib/scoring.ts'

const DEFAULT_SNAPSHOT_BATCH_SIZE = 100
const DEFAULT_UPSERT_BATCH_SIZE = 300

function parseArgs(argv) {
  return argv.reduce(
    (acc, arg) => {
      if (arg === '--apply') acc.apply = true
      else if (arg === '--dry-run') acc.apply = false
      else if (arg.startsWith('--limit=')) acc.limit = Number(arg.slice('--limit='.length))
      else if (arg.startsWith('--batch-size=')) acc.batchSize = Number(arg.slice('--batch-size='.length))
      else if (arg.startsWith('--upsert-batch-size=')) acc.upsertBatchSize = Number(arg.slice('--upsert-batch-size='.length))
      else if (arg.startsWith('--store=')) acc.storeId = arg.slice('--store='.length).trim()
      else if (arg.startsWith('--source=')) acc.sourceId = arg.slice('--source='.length).trim()
      else if (arg.startsWith('--since=')) acc.since = arg.slice('--since='.length).trim()
      return acc
    },
    {
      apply: false,
      batchSize: DEFAULT_SNAPSHOT_BATCH_SIZE,
      limit: undefined,
      since: undefined,
      sourceId: undefined,
      storeId: undefined,
      upsertBatchSize: DEFAULT_UPSERT_BATCH_SIZE,
    },
  )
}

function clampPositiveInteger(value, fallback, max) {
  return Number.isFinite(value) && value > 0 ? Math.min(max, Math.floor(value)) : fallback
}

function bodyHash(body) {
  return createHash('sha256').update(body.replace(/\s+/g, ' ').trim()).digest('hex')
}

function normalizedPostContentKey(input) {
  const articleNo = input.articleNo?.trim()
  if (articleNo) return `article:${articleNo}`

  const authorName = input.authorName.replace(/\s+/g, ' ').trim() || '記載なし'
  const authorGender = input.authorGender.replace(/\s+/g, '').trim() || '記載なし'
  return `body:${bodyHash([authorName, authorGender, input.body].join('|'))}`
}

function toNormalizedRow(snapshot, post) {
  const body = post.body.trim()
  const articleNo = post.articleNo?.trim() || null
  const authorName = post.authorName.trim() || '記載なし'
  const authorGender = post.authorGender.trim() || '記載なし'

  return {
    id: randomUUID(),
    article_no: articleNo,
    author_gender: authorGender,
    author_name: authorName,
    body,
    body_hash: bodyHash(body),
    content_key: normalizedPostContentKey({
      articleNo: articleNo ?? undefined,
      authorGender,
      authorName,
      body,
    }),
    observed_at: snapshot.captured_at,
    posted_at: post.postedAt || null,
    source_id: snapshot.source_id,
    source_url: snapshot.url,
    store_id: snapshot.store_id,
  }
}

function chunk(array, size) {
  const chunks = []
  for (let index = 0; index < array.length; index += size) chunks.push(array.slice(index, index + size))
  return chunks
}

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。')
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
}

async function countNormalizedPosts(supabase) {
  const { count, error } = await supabase.from('bbs_normalized_posts').select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const batchSize = clampPositiveInteger(options.batchSize, DEFAULT_SNAPSHOT_BATCH_SIZE, 500)
  const upsertBatchSize = clampPositiveInteger(options.upsertBatchSize, DEFAULT_UPSERT_BATCH_SIZE, 1000)
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : undefined
  const supabase = createSupabaseClient()

  const beforeCount = await countNormalizedPosts(supabase)
  const seen = new Set()
  const storeCounts = new Map()
  let scanned = 0
  let extracted = 0
  let prepared = 0
  let insertedOrSkipped = 0
  let offset = 0

  while (limit == null || scanned < limit) {
    const currentBatchSize = limit == null ? batchSize : Math.min(batchSize, limit - scanned)
    if (currentBatchSize <= 0) break

    let query = supabase
      .from('bbs_snapshots')
      .select('id,source_id,store_id,url,extracted_text,captured_at')
      .neq('extracted_text', '')
      .order('captured_at', { ascending: false })
      .range(offset, offset + currentBatchSize - 1)

    if (options.storeId) query = query.eq('store_id', options.storeId)
    if (options.sourceId) query = query.eq('source_id', options.sourceId)
    if (options.since) query = query.gte('captured_at', options.since)

    const { data: snapshots, error } = await query
    if (error) throw error
    if (!snapshots?.length) break

    scanned += snapshots.length
    offset += snapshots.length

    const rows = []
    for (const snapshot of snapshots) {
      const posts = extractNormalizedBbsPostsFromText(snapshot.extracted_text ?? '', snapshot.captured_at)
      extracted += posts.length

      for (const post of posts) {
        const row = toNormalizedRow(snapshot, post)
        if (!row.body || row.body.length < 2) continue
        const key = `${row.store_id}:${row.content_key}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push(row)
        storeCounts.set(row.store_id, (storeCounts.get(row.store_id) ?? 0) + 1)
      }
    }

    prepared += rows.length

    if (options.apply && rows.length) {
      for (const rowChunk of chunk(rows, upsertBatchSize)) {
        const { error } = await supabase.from('bbs_normalized_posts').upsert(rowChunk, {
          ignoreDuplicates: true,
          onConflict: 'store_id,content_key',
        })
        if (error) throw error
        insertedOrSkipped += rowChunk.length
      }
    }

    process.stdout.write(
      `${options.apply ? 'apply' : 'dry-run'} scanned=${scanned} extracted=${extracted} prepared=${prepared} uniqueStores=${storeCounts.size}\n`,
    )
  }

  const afterCount = options.apply ? await countNormalizedPosts(supabase) : beforeCount
  const topStores = [...storeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([storeId, count]) => ({ storeId, count }))

  console.log(
    JSON.stringify(
      {
        apply: options.apply,
        beforeCount,
        afterCount,
        insertedDelta: afterCount - beforeCount,
        insertedOrSkipped,
        prepared,
        scanned,
        topStores,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
