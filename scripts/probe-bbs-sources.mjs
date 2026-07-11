import { createClient } from '@supabase/supabase-js'
import { extractNormalizedBbsPostsFromText } from '../src/lib/scoring.ts'
import { scrapePublicPage } from '../src/lib/server/scrape.ts'

const CONCURRENCY = 4

function createDatabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SupabaseのURLとサービスロールキーが必要です。')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function probeSource(source) {
  const startedAt = Date.now()
  const result = await scrapePublicPage(source.url)
  const posts = result.status === 'ok' ? extractNormalizedBbsPostsFromText(result.extractedText, result.fetchedAt) : []
  const timedPosts = posts.filter((post) => Boolean(post.postedAt)).length

  return {
    id: source.id,
    storeId: source.store_id,
    status: result.status,
    elapsedMs: Date.now() - startedAt,
    textLength: result.extractedText.length,
    postCount: posts.length,
    timedPostCount: timedPosts,
    timestampCoverage: posts.length ? Math.round((timedPosts / posts.length) * 100) : 0,
    message: result.message || result.title || '',
    url: source.url,
  }
}

const supabase = createDatabaseClient()
const { data: sources, error } = await supabase
  .from('bbs_sources')
  .select('id,store_id,url,active')
  .eq('active', true)
  .order('id')
if (error) throw error

const rows = []
for (let index = 0; index < (sources ?? []).length; index += CONCURRENCY) {
  rows.push(...(await Promise.all((sources ?? []).slice(index, index + CONCURRENCY).map(probeSource))))
}

const okRows = rows.filter((row) => row.status === 'ok')
const rowsWithPosts = okRows.filter((row) => row.postCount > 0)
console.log(JSON.stringify({
  auditedAt: new Date().toISOString(),
  summary: {
    activeSources: rows.length,
    reachableSources: okRows.length,
    sourcesWithPosts: rowsWithPosts.length,
    failedSources: rows.filter((row) => row.status !== 'ok').length,
    totalPosts: rows.reduce((sum, row) => sum + row.postCount, 0),
    timedPosts: rows.reduce((sum, row) => sum + row.timedPostCount, 0),
  },
  sources: rows,
}, null, 2))
