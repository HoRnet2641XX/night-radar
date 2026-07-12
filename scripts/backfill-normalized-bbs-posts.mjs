import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  extractNormalizedBbsPostsFromText,
  isLikelyCustomerNormalizedPost,
  isRankableCustomerNormalizedPost,
  isStructurallyValidCustomerNormalizedPost,
} from '../src/lib/scoring.ts'

const DEFAULT_SNAPSHOT_BATCH_SIZE = 100
const DEFAULT_UPSERT_BATCH_SIZE = 300

function parseArgs(argv) {
  return argv.reduce(
    (acc, arg) => {
      if (arg === '--apply') acc.apply = true
      else if (arg === '--dry-run') acc.apply = false
      else if (arg === '--replace-existing') acc.replaceExisting = true
      else if (arg === '--prune-invalid') acc.pruneInvalid = true
      else if (arg === '--insert-missing') acc.insertMissing = true
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
      insertMissing: false,
      limit: undefined,
      pruneInvalid: false,
      replaceExisting: false,
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

async function loadExistingRows(supabase) {
  const rows = []
  const pageSize = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('bbs_normalized_posts')
      .select('id,source_id,store_id,source_url,article_no,author_name,author_gender,posted_at,observed_at,body,body_hash,content_key')
      .order('observed_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    offset += data.length
    if (data.length < pageSize) break
  }
  return rows
}

function validationPost(row) {
  return {
    storeId: row.store_id,
    authorName: row.author_name,
    body: row.body,
    postedAt: row.posted_at ?? undefined,
  }
}

function suspiciousAuthor(value) {
  return /(?:投稿日|投稿日時?|書き込み日時?|記事番号|\s(?:今から|これから|行き|行く|伺|お昼|夜|夕方|予定|初めて|久しぶり))/i.test(value)
}

function rowQuality(row) {
  const post = validationPost(row)
  let score = 0
  if (isStructurallyValidCustomerNormalizedPost(post)) score += 20
  if (isRankableCustomerNormalizedPost(post)) score += 12
  if (!suspiciousAuthor(row.author_name)) score += 8
  if (row.author_name.length <= 40) score += 3
  if (row.author_gender && row.author_gender !== '記載なし') score += 2
  if (!/^Re[:：]?\s*/i.test(row.body)) score += 3
  if (/(行|伺|来店|お邪魔|初めて|久しぶり|予定|向か|寄)/.test(row.body)) score += 2
  return score
}

function shouldReplaceExisting(existing, candidate) {
  const existingPost = validationPost(existing)
  const candidatePost = validationPost(candidate)
  const existingStructured = isStructurallyValidCustomerNormalizedPost(existingPost)
  const candidateStructured = isStructurallyValidCustomerNormalizedPost(candidatePost)
  if (!candidateStructured) return false
  if (!existingStructured) return true
  if (suspiciousAuthor(existing.author_name) && !suspiciousAuthor(candidate.author_name)) return true
  return rowQuality(candidate) > rowQuality(existing)
}

function newerTimestamp(left, right) {
  const leftTime = new Date(left ?? 0).getTime()
  const rightTime = new Date(right ?? 0).getTime()
  return Number.isFinite(leftTime) && leftTime >= rightTime ? left : right
}

function mergeCandidate(existing, candidate) {
  if (!existing) return candidate
  return {
    ...candidate,
    posted_at: candidate.posted_at || existing.posted_at,
    observed_at: newerTimestamp(existing.observed_at, candidate.observed_at),
  }
}

async function writeBackup(rows) {
  const directory = resolve('output', 'backups')
  await mkdir(directory, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = resolve(directory, `bbs-normalized-posts-${timestamp}.json`)
  await writeFile(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8')
  return path
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const batchSize = clampPositiveInteger(options.batchSize, DEFAULT_SNAPSHOT_BATCH_SIZE, 500)
  const upsertBatchSize = clampPositiveInteger(options.upsertBatchSize, DEFAULT_UPSERT_BATCH_SIZE, 1000)
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : undefined
  if (options.pruneInvalid && !options.replaceExisting) {
    throw new Error('--prune-invalid は --replace-existing と同時に指定してください。')
  }
  if (options.pruneInvalid && (limit || options.storeId || options.sourceId || options.since)) {
    throw new Error('--prune-invalid は全件再解析時のみ使用できます。')
  }
  const supabase = createSupabaseClient()

  const beforeCount = await countNormalizedPosts(supabase)
  const existingRows = await loadExistingRows(supabase)
  const existingByKey = new Map(existingRows.map((row) => [`${row.store_id}:${row.content_key}`, row]))
  const backupPath = options.apply && (options.replaceExisting || options.pruneInvalid)
    ? await writeBackup(existingRows)
    : undefined
  const seen = new Set()
  const storeCounts = new Map()
  let scanned = 0
  let extracted = 0
  let prepared = 0
  let inserted = 0
  let updated = 0
  let skipped = 0
  let written = 0
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
        if (!isLikelyCustomerNormalizedPost({ ...post, storeId: snapshot.store_id })) continue
        const row = toNormalizedRow(snapshot, post)
        if (!row.body || row.body.length < 2) continue
        const key = `${row.store_id}:${row.content_key}`
        if (seen.has(key)) continue
        seen.add(key)
        const existing = existingByKey.get(key)
        const candidate = mergeCandidate(existing, row)
        if (!existing && options.replaceExisting && !options.insertMissing) {
          skipped += 1
          continue
        }
        if (existing && (!options.replaceExisting || !shouldReplaceExisting(existing, candidate))) {
          skipped += 1
          continue
        }
        if (existing) updated += 1
        else inserted += 1
        rows.push(candidate)
        existingByKey.set(key, existing ? { ...existing, ...candidate } : { ...candidate, id: null })
        storeCounts.set(row.store_id, (storeCounts.get(row.store_id) ?? 0) + 1)
      }
    }

    prepared += rows.length

    if (options.apply && rows.length) {
      for (const rowChunk of chunk(rows, upsertBatchSize)) {
        const { error } = await supabase.from('bbs_normalized_posts').upsert(rowChunk, {
          ignoreDuplicates: !options.replaceExisting,
          onConflict: 'store_id,content_key',
        })
        if (error) throw error
        written += rowChunk.length
      }
    }

    process.stdout.write(
      `${options.apply ? 'apply' : 'dry-run'} scanned=${scanned} extracted=${extracted} prepared=${prepared} insert=${inserted} update=${updated} skipped=${skipped} uniqueStores=${storeCounts.size}\n`,
    )
  }

  const invalidIds = [...existingByKey.values()]
    .filter((row) => row.id && !isStructurallyValidCustomerNormalizedPost(validationPost(row)))
    .map((row) => row.id)
  let pruned = 0
  if (options.apply && options.pruneInvalid && invalidIds.length) {
    for (const idChunk of chunk(invalidIds, upsertBatchSize)) {
      const { error } = await supabase.from('bbs_normalized_posts').delete().in('id', idChunk)
      if (error) throw error
      pruned += idChunk.length
    }
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
        backupPath,
        beforeCount,
        afterCount,
        insertedDelta: afterCount - beforeCount,
        inserted,
        insertMissing: options.insertMissing,
        invalidRemaining: options.apply && options.pruneInvalid ? invalidIds.length - pruned : invalidIds.length,
        pruned,
        prepared,
        replaceExisting: options.replaceExisting,
        scanned,
        skipped,
        topStores,
        updated,
        wouldPrune: invalidIds.length,
        written,
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
