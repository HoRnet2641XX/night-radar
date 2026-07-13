import { createClient } from '@supabase/supabase-js'
import {
  extractNormalizedBbsPostsFromText,
  filterPostsForDecisionDate,
  isExplicitlyEmptyBbsText,
  isLikelyCustomerNormalizedPost,
  isRankableCustomerNormalizedPost,
  isStructurallyValidCustomerNormalizedPost,
  normalizedBbsPostsToPostRecords,
} from '../src/lib/scoring.ts'
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
  const explicitlyEmpty = isExplicitlyEmptyBbsText(result.extractedText)
  const customerCandidates = explicitlyEmpty
    ? []
    : posts.filter((post) => isLikelyCustomerNormalizedPost({ ...post, storeId: source.store_id }))
  const structuredPosts = customerCandidates.filter((post) => isStructurallyValidCustomerNormalizedPost({ ...post, storeId: source.store_id }))
  const rankablePosts = structuredPosts.filter((post) => isRankableCustomerNormalizedPost({ ...post, storeId: source.store_id }))
  const timedPosts = rankablePosts.length
  const decisionDatePosts = filterPostsForDecisionDate(
    normalizedBbsPostsToPostRecords(rankablePosts.map((post, index) => ({
      ...post,
      id: `probe-${source.id}-${index}`,
      sourceId: source.id,
      storeId: source.store_id,
      sourceUrl: source.url,
      observedAt: result.fetchedAt,
      bodyHash: '',
      contentKey: '',
    }))),
    result.fetchedAt,
  )

  return {
    id: source.id,
    storeId: source.store_id,
    status: result.status,
    elapsedMs: Date.now() - startedAt,
    textLength: result.extractedText.length,
    postCount: posts.length,
    customerCandidateCount: customerCandidates.length,
    structuredPostCount: structuredPosts.length,
    rankablePostCount: rankablePosts.length,
    rejectedPostCount: customerCandidates.length - structuredPosts.length,
    timedPostCount: timedPosts,
    decisionDatePostCount: decisionDatePosts.length,
    timestampCoverage: structuredPosts.length ? Math.round((timedPosts / structuredPosts.length) * 100) : 0,
    parserHealth:
      result.status !== 'ok'
        ? '取得失敗'
        : customerCandidates.length === 0 && explicitlyEmpty
          ? '投稿0件'
        : customerCandidates.length === 0
          ? '顧客投稿0件'
        : structuredPosts.length === 0
          ? '構造解析失敗'
          : structuredPosts.length > 0 && timedPosts / structuredPosts.length < 0.5
            ? '投稿時刻の解析不足'
            : '正常',
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
const rowsWithPosts = okRows.filter((row) => row.rankablePostCount > 0)
console.log(JSON.stringify({
  auditedAt: new Date().toISOString(),
  summary: {
    activeSources: rows.length,
    reachableSources: okRows.length,
    sourcesWithPosts: rowsWithPosts.length,
    failedSources: rows.filter((row) => row.status !== 'ok').length,
    totalParsedRows: rows.reduce((sum, row) => sum + row.postCount, 0),
    structuredPosts: rows.reduce((sum, row) => sum + row.structuredPostCount, 0),
    rankablePosts: rows.reduce((sum, row) => sum + row.rankablePostCount, 0),
    timedPosts: rows.reduce((sum, row) => sum + row.timedPostCount, 0),
    decisionDatePosts: rows.reduce((sum, row) => sum + row.decisionDatePostCount, 0),
  },
  sources: rows,
}, null, 2))
