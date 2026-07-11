import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { normalizedBbsPostIdentityMaterial } from '../src/lib/scoring.ts'

const PAGE_SIZE = 1000
const applyChanges = process.argv.includes('--apply')

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

async function main() {
  const db = createDatabaseClient()
  const rows = await collectRows(db)
  const groups = duplicateGroups(rows)
  const duplicateRows = groups.reduce((sum, group) => sum + group.length - 1, 0)

  if (!applyChanges || !groups.length) {
    console.log(JSON.stringify({ mode: applyChanges ? 'apply' : 'dry-run', scannedRows: rows.length, duplicateGroups: groups.length, duplicateRows }, null, 2))
    return
  }

  let deletedRows = 0
  let updatedRows = 0
  for (const group of groups) {
    const newest = group[0]
    const desiredKey = desiredContentKey(newest)
    const keeper = group.find((row) => row.content_key === desiredKey) ?? newest
    const redundantIds = group.filter((row) => row.id !== keeper.id).map((row) => row.id)

    if (redundantIds.length) {
      const { error: deleteError } = await db.from('bbs_normalized_posts').delete().in('id', redundantIds)
      if (deleteError) throw deleteError
      deletedRows += redundantIds.length
    }

    const updates = {
      author_name: newest.author_name,
      author_gender: newest.author_gender,
      posted_at: newest.posted_at,
      observed_at: newest.observed_at,
      body: newest.body,
      body_hash: newest.body_hash,
      content_key: desiredKey,
    }
    const { error: updateError } = await db.from('bbs_normalized_posts').update(updates).eq('id', keeper.id)
    if (updateError) throw updateError
    updatedRows += 1
  }

  console.log(JSON.stringify({ mode: 'apply', scannedRows: rows.length, duplicateGroups: groups.length, deletedRows, updatedRows }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
