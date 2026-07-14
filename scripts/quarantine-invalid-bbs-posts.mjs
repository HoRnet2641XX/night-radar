import { createClient } from '@supabase/supabase-js'
import {
  isObviousBbsSpamBody,
  isStructurallyValidCustomerNormalizedPost,
} from '../src/lib/scoring.ts'

const PAGE_SIZE = 1000
const CHUNK_SIZE = 100
const applyChanges = process.argv.includes('--apply')
const allRows = process.argv.includes('--all')
const hoursArg = process.argv.find((arg) => arg.startsWith('--hours='))
const recentHours = Math.max(1, Number(hoursArg?.slice('--hours='.length) || 48))

function createDatabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SupabaseのURLとサービスロールキーが必要です。')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function collectRows(db) {
  const rows = []
  const threshold = new Date(Date.now() - recentHours * 60 * 60 * 1000).toISOString()
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = db
      .from('bbs_normalized_posts')
      .select('*')
      .order('observed_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (!allRows) query = query.gte('observed_at', threshold)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
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

function quarantineReason(row) {
  const post = toNormalizedPost(row)
  const reasons = []
  if (isObviousBbsSpamBody(post.body)) reasons.push('obvious_spam')
  if (!isStructurallyValidCustomerNormalizedPost(post)) reasons.push('invalid_structure')
  return reasons.join(',')
}

function summarize(rows) {
  const byStore = {}
  const byReason = {}
  for (const row of rows) {
    byStore[row.store_id] = (byStore[row.store_id] ?? 0) + 1
    for (const reason of row.reason.split(',')) byReason[reason] = (byReason[reason] ?? 0) + 1
  }
  return { byStore, byReason }
}

async function main() {
  const db = createDatabaseClient()
  const rows = await collectRows(db)
  const targets = rows
    .map((row) => ({ ...row, reason: quarantineReason(row) }))
    .filter((row) => row.reason)
  const summary = summarize(targets)

  if (!applyChanges || targets.length === 0) {
    console.log(JSON.stringify({
      mode: applyChanges ? 'apply' : 'dry-run',
      scope: allRows ? 'all' : `observed within ${recentHours} hours`,
      scannedRows: rows.length,
      targetRows: targets.length,
      ...summary,
    }, null, 2))
    return
  }

  const sourceIds = [...new Set(targets.map((row) => row.source_id).filter(Boolean))]
  const missingSnapshots = []
  for (const sourceId of sourceIds) {
    const { count, error } = await db
      .from('bbs_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', sourceId)
    if (error) throw new Error(`巡回スナップショットの確認に失敗しました: ${error.message}`)
    if (!count) missingSnapshots.push(sourceId)
  }
  if (missingSnapshots.length) {
    throw new Error(`原文スナップショットがない取得元は削除できません: ${missingSnapshots.join(', ')}`)
  }

  const ids = targets.map((row) => row.id)
  for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
    const chunk = ids.slice(index, index + CHUNK_SIZE)
    const { error } = await db.from('bbs_normalized_posts').delete().in('id', chunk)
    if (error) throw new Error(`安全削除に失敗しました: ${error.message}`)
  }
  let remaining = 0
  for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
    const chunk = ids.slice(index, index + CHUNK_SIZE)
    const { count, error: verifyError } = await db
      .from('bbs_normalized_posts')
      .select('id', { count: 'exact', head: true })
      .in('id', chunk)
    if (verifyError) throw new Error(`安全削除後の確認に失敗しました: ${verifyError.message || '詳細なし'}`)
    remaining += count ?? 0
  }
  if (remaining) throw new Error(`${remaining}件が残っているため、安全削除を完了できませんでした。`)

  console.log(JSON.stringify({
    mode: 'safe-delete',
    scope: allRows ? 'all' : `observed within ${recentHours} hours`,
    scannedRows: rows.length,
    targetRows: targets.length,
    preservedSnapshotSources: sourceIds.length,
    deletedRows: ids.length,
    ...summary,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
