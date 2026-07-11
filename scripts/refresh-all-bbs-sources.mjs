import { createClient } from '@supabase/supabase-js'
import { crawlDueBbsSourcesForCron } from '../src/lib/server/repository.ts'

const BATCH_SIZE = 8

function createDatabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SupabaseのURLとサービスロールキーが必要です。')
  return createClient(url, key, { auth: { persistSession: false } })
}

const supabase = createDatabaseClient()
const { data: sources, error } = await supabase
  .from('bbs_sources')
  .select('id')
  .eq('active', true)
  .order('id')
if (error) throw error

const results = []
const sourceIds = (sources ?? []).map((source) => source.id)
for (let index = 0; index < sourceIds.length; index += BATCH_SIZE) {
  const batchIds = sourceIds.slice(index, index + BATCH_SIZE)
  const batch = await crawlDueBbsSourcesForCron({
    force: true,
    maxCrawls: batchIds.length,
    sourceIds: batchIds,
  })
  results.push(...batch.results)
}

console.log(JSON.stringify({
  refreshedAt: new Date().toISOString(),
  sourceCount: sourceIds.length,
  okCount: results.filter((result) => result.run.status === 'ok').length,
  failedCount: results.filter((result) => result.run.status !== 'ok').length,
  normalizedPostCount: results.reduce((sum, result) => sum + result.normalizedPosts.length, 0),
  sources: results.map((result) => ({
    id: result.source.id,
    storeId: result.source.storeId,
    status: result.run.status,
    normalizedPostCount: result.normalizedPosts.length,
    message: result.run.message,
  })),
}, null, 2))
