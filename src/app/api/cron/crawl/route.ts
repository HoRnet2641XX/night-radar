import { revalidateTag } from 'next/cache'
import { jsonError } from '@/lib/env'
import { PUBLIC_DIRECTORY_CACHE_TAG } from '@/lib/public-directory-cache'
import { cronCrawlHttpStatus, getCronAuthorizationError } from '@/lib/server/cron-auth'
import { crawlDueBbsSourcesForCron, RepositoryError } from '@/lib/server/repository'
import type { CronCrawlOptions } from '@/lib/server/repository'

export const runtime = 'nodejs'
export const maxDuration = 30

type CronCrawlResult = Awaited<ReturnType<typeof crawlDueBbsSourcesForCron>>

function cronRouteBudgetMs() {
  const configured = Number(process.env.CRON_ROUTE_BUDGET_MS)
  if (!Number.isFinite(configured) || configured <= 0) return 20_000
  return Math.max(10_000, Math.min(24_000, Math.floor(configured)))
}

function getCronCrawlOptions(request: Request): CronCrawlOptions {
  const url = new URL(request.url)
  const batchSizeValue = Number(url.searchParams.get('batchSize') ?? url.searchParams.get('size') ?? 0)
  const batchSize = Number.isFinite(batchSizeValue) && batchSizeValue > 0 ? batchSizeValue : undefined
  const maxCrawlsValue = Number(url.searchParams.get('maxCrawls') ?? url.searchParams.get('max') ?? 0)
  const maxCrawls = Number.isFinite(maxCrawlsValue) && maxCrawlsValue > 0 ? maxCrawlsValue : undefined
  const batchValue = url.searchParams.get('batch')
  let batch: CronCrawlOptions['batch']
  if (batchValue === 'auto') batch = 'auto'
  else if (batchValue != null) {
    const parsedBatch = Number(batchValue)
    batch = Number.isFinite(parsedBatch) && parsedBatch >= 0 ? parsedBatch : undefined
  }
  const sourceIds = parseSourceIds(url.searchParams.get('source') ?? url.searchParams.get('sourceId') ?? url.searchParams.get('sources') ?? url.searchParams.get('ids'))
  const excludeSourceIds = parseSourceIds(url.searchParams.get('exclude') ?? url.searchParams.get('excludeSource') ?? url.searchParams.get('excludeSourceId'))
  const force = ['1', 'true', 'yes'].includes((url.searchParams.get('force') ?? '').toLowerCase())
  const concurrencyValue = Number(url.searchParams.get('concurrency') ?? 0)
  const concurrency = Number.isFinite(concurrencyValue) && concurrencyValue > 0 ? concurrencyValue : undefined

  return {
    batch,
    batchSize,
    captureBrowserScreenshots: false,
    concurrency,
    excludeSourceIds,
    force,
    maxCrawls,
    sourceIds,
  }
}

function compactCronCrawlResult(result: CronCrawlResult, elapsedMs: number) {
  const failedResults = result.results.filter(({ run }) => run.status === 'failed' || run.status === 'blocked')
  const successCount = result.results.length - failedResults.length
  return {
    mode: result.mode,
    elapsedMs,
    checked: result.checked,
    selected: result.selected,
    due: result.due,
    crawled: result.crawled,
    skippedDue: result.skippedDue,
    batch: result.batch,
    filters: result.filters,
    failureNotificationCount: result.failureNotificationCount,
    screenshotFailureCount: result.screenshotFailureCount,
    failureCount: failedResults.length,
    successCount,
    degraded: failedResults.length > 0 && successCount > 0,
    results: result.results.map(({ source, run, post, snapshot, normalizedPosts }) => ({
      source: {
        id: source.id,
        storeId: source.storeId,
        url: source.url,
        status: source.lastStatus,
        message: source.lastMessage,
      },
      run: {
        id: run.id,
        status: run.status,
        message: run.message,
        fetchedAt: run.fetchedAt,
        postId: run.postId,
      },
      post: post
        ? {
            id: post.id,
            storeId: post.storeId,
            sourceUrl: post.sourceUrl,
            postedAt: post.postedAt,
            bodyLength: post.body.length,
            keywordCount: post.keywords.length,
          }
        : null,
      snapshot: snapshot
        ? {
            id: snapshot.id,
            storeId: snapshot.storeId,
            url: snapshot.url,
            radarScore: snapshot.radarScore,
            capturedAt: snapshot.capturedAt,
            metrics: snapshot.metrics,
            hasScreenshot: Boolean(snapshot.screenshotDataUrl),
            extractedTextLength: snapshot.extractedText.length,
          }
        : null,
      normalizedPostCount: normalizedPosts.length,
    })),
  }
}

function parseSourceIds(value: string | null) {
  return (
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  )
}

export async function GET(request: Request) {
  const authorizationError = getCronAuthorizationError(request, 'BBS巡回')
  if (authorizationError) return jsonError(authorizationError, authorizationError.includes('CRON_SECRET') ? 503 : 401)

  try {
    const startedAt = Date.now()
    const options = getCronCrawlOptions(request)
    options.concurrency ??= 30
    options.deadlineAt = startedAt + cronRouteBudgetMs()
    const result = await crawlDueBbsSourcesForCron(options)
    if (result.crawled > 0) revalidateTag(PUBLIC_DIRECTORY_CACHE_TAG, { expire: 0 })
    const response = compactCronCrawlResult(result, Date.now() - startedAt)
    return Response.json(response, { status: cronCrawlHttpStatus(response.failureCount, response.crawled) })
  } catch (error) {
    if (error instanceof RepositoryError) {
      const status = error.status === 404 ? 404 : error.status >= 500 ? error.status : 503
      return jsonError(error.message, status)
    }
    return jsonError(error instanceof Error ? error.message : 'BBS巡回に失敗しました。', 500)
  }
}
