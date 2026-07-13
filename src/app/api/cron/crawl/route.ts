import { revalidateTag } from 'next/cache'
import { jsonError } from '@/lib/env'
import { PUBLIC_DIRECTORY_CACHE_TAG } from '@/lib/public-directory-cache'
import { cronCrawlHttpStatus, getCronAuthorizationError } from '@/lib/server/cron-auth'
import { crawlDueBbsSourcesForCron, RepositoryError } from '@/lib/server/repository'
import type { CronCrawlOptions } from '@/lib/server/repository'

export const runtime = 'nodejs'
export const maxDuration = 30

type CronCrawlResult = Awaited<ReturnType<typeof crawlDueBbsSourcesForCron>>

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
  const captureBrowserScreenshots = ['1', 'true', 'yes'].includes(
    (url.searchParams.get('screenshots') ?? url.searchParams.get('captureScreenshots') ?? '').toLowerCase(),
  )

  return {
    batch,
    batchSize,
    captureBrowserScreenshots,
    excludeSourceIds,
    force,
    maxCrawls,
    sourceIds,
  }
}

function compactCronCrawlResult(result: CronCrawlResult, elapsedMs: number) {
  const failedResults = result.results.filter(({ run }) => run.status === 'failed' || run.status === 'blocked')
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
    failureCount: failedResults.length,
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
    const result = await crawlDueBbsSourcesForCron(getCronCrawlOptions(request))
    if (result.crawled > 0) revalidateTag(PUBLIC_DIRECTORY_CACHE_TAG, { expire: 0 })
    const response = compactCronCrawlResult(result, Date.now() - startedAt)
    return Response.json(response, { status: cronCrawlHttpStatus(response.failureCount) })
  } catch (error) {
    if (error instanceof RepositoryError && error.status === 503) {
      return Response.json({ mode: 'demo', checked: 0, crawled: 0, message: error.message })
    }
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : 'BBS巡回に失敗しました。', 400)
  }
}
