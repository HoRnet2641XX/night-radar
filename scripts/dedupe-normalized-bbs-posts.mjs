import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import {
  dedupeNormalizedBbsPosts,
  isObviousBbsSpamBody,
  isStructurallyValidCustomerNormalizedPost,
  normalizedBbsPostIdentityMaterial,
} from '../src/lib/scoring.ts'

const PAGE_SIZE = 1000
const applyChanges = process.argv.includes('--apply')
const rewriteKeys = process.argv.includes('--rewrite-keys')
const purgeSpam = process.argv.includes('--purge-spam')

function createDatabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SupabaseのURLとサービスロールキーが必要です。')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function collectRows(db) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('bbs_normalized_posts')
      .select('id,store_id,article_no,author_name,author_gender,posted_at,observed_at,body,body_hash,content_key')
      .order('observed_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

function identityMaterial(row) {
  return normalizedBbsPostIdentityMaterial({
    articleNo: row.article_no || undefined,
    authorName: row.author_name || '記載なし',
    postedAt: row.posted_at || undefined,
    body: row.body || '',
  })
}

function desiredContentKey(row) {
  const material = identityMaterial(row)
  if (material.startsWith('article:')) return material
  return `body:${createHash('sha256').update(material.replace(/\s+/g, ' ').trim()).digest('hex')}`
}

function duplicateGroups(rows) {
  const groups = new Map()
  for (const row of rows) {
    if (!row.article_no && !row.posted_at) continue
    const key = `${row.store_id}:${identityMaterial(row)}`
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  return [...groups.values()].filter((group) => group.length > 1)
}

function toNormalizedPost(row) {
  return {
    id: row.id,
    storeId: row.store_id,
    articleNo: row.article_no || undefined,
    authorName: row.author_name || '記載なし',
    authorGender: row.author_gender || '記載なし',
    postedAt: row.posted_at || undefined,
    observedAt: row.observed_at,
    body: row.body || '',
    bodyHash: row.body_hash || '',
    contentKey: row.content_key || '',
  }
}

async function main() {
  const db = createDatabaseClient()
  const rows = await collectRows(db)
  const groups = duplicateGroups(rows)
  const exactDuplicateRows = groups.reduce((sum, group) => sum + group.length - 1, 0)
  const normalizedPosts = rows.map(toNormalizedPost)
  const invalidRows = rows.filter((row, index) => !isStructurallyValidCustomerNormalizedPost(normalizedPosts[index]))
  const spamRows = rows.filter((row) => isObviousBbsSpamBody(row.body || ''))
  const keptIds = new Set(dedupeNormalizedBbsPosts(normalizedPosts).map((post) => post.id))
  const redundantRows = rows.filter((row) => !keptIds.has(row.id))
  const keptRows = rows.filter((candidate) => keptIds.has(candidate.id))
  const keyRewriteCandidates = keptRows.filter((row) => row.content_key !== desiredContentKey(row)).length

  if (!applyChanges) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      scannedRows: rows.length,
      exactDuplicateGroups: groups.length,
      exactDuplicateRows,
      effectiveDuplicateRows: redundantRows.length,
      invalidRows: invalidRows.length,
      spamRows: spamRows.length,
      purgeSpam,
      keyRewriteCandidates,
    }, null, 2))
    return
  }

  let deletedRows = 0
  let updatedRows = 0
  const deletionMap = new Map(redundantRows.map((row) => [row.id, row]))
  if (purgeSpam) spamRows.forEach((row) => deletionMap.set(row.id, row))
  const rowsToDelete = [...deletionMap.values()]
  for (let index = 0; index < rowsToDelete.length; index += 100) {
    const ids = rowsToDelete.slice(index, index + 100).map((row) => row.id)
    const { error: deleteError } = await db.from('bbs_normalized_posts').delete().in('id', ids)
    if (deleteError) throw deleteError
    deletedRows += ids.length
  }

  for (const row of rewriteKeys ? keptRows : []) {
    const contentKey = desiredContentKey(row)
    if (row.content_key === contentKey) continue
    const { error: updateError } = await db.from('bbs_normalized_posts').update({ content_key: contentKey }).eq('id', row.id)
    if (updateError) throw updateError
    updatedRows += 1
  }

  console.log(JSON.stringify({
    mode: 'apply',
    scannedRows: rows.length,
    exactDuplicateGroups: groups.length,
    effectiveDuplicateRows: redundantRows.length,
    invalidRows: invalidRows.length,
    spamRows: spamRows.length,
    purgeSpam,
    keyRewriteCandidates,
    deletedRows,
    updatedRows,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
