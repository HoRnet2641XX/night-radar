import { createClient } from '@supabase/supabase-js'
import { crawlDueBbsSourcesForCron } from '../src/lib/server/repository.ts'

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

const sourceIds = (sources ?? []).map((source) => source.id)
const startedAt = Date.now()
const batch = await crawlDueBbsSourcesForCron({
  captureBrowserScreenshots: true,
  force: true,
  maxCrawls: sourceIds.length,
  screenshotCrawls: Number(process.env.CRON_SCREENSHOTS_PER_RUN) || 3,
  sourceIds,
})
const results = batch.results

console.log(JSON.stringify({
  refreshedAt: new Date().toISOString(),
  elapsedMs: Date.now() - startedAt,
  sourceCount: sourceIds.length,
  okCount: results.filter((result) => result.run.status === 'ok').length,
  failedCount: results.filter((result) => result.run.status !== 'ok').length,
  screenshotCount: results.filter((result) => result.snapshot?.screenshotDataUrl?.startsWith('data:image/jpeg')).length,
  screenshotFailureCount: batch.screenshotFailureCount,
  normalizedPostCount: results.reduce((sum, result) => sum + result.normalizedPosts.length, 0),
  sources: results.map((result) => ({
    id: result.source.id,
    storeId: result.source.storeId,
    status: result.run.status,
    normalizedPostCount: result.normalizedPosts.length,
    message: result.run.message,
  })),
}, null, 2))
