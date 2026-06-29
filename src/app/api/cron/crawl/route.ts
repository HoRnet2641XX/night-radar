import { jsonError } from '@/lib/env'
import { crawlDueBbsSourcesForCron, RepositoryError } from '@/lib/server/repository'
import type { CronCrawlOptions } from '@/lib/server/repository'

export const runtime = 'nodejs'
export const maxDuration = 30

type CronCrawlResult = Awaited<ReturnType<typeof crawlDueBbsSourcesForCron>>

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV || process.env.VERCEL)
}

function getCronAuthorizationError(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return isProductionRuntime() ? '本番環境でBBS巡回を実行するにはCRON_SECRETの設定が必要です。' : null
  }
  return request.headers.get('authorization') === `Bearer ${secret}` ? null : 'BBS巡回の認証に失敗しました。'
}

function getCronCrawlOptions(request: Request): CronCrawlOptions {
  const url = new URL(request.url)
  const batchSizeValue = Number(url.searchParams.get('batchSize') ?? url.searchParams.get('size') ?? 0)
  const batchSize = Number.isFinite(batchSizeValue) && batchSizeValue > 0 ? batchSizeValue : undefined
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

  return {
    batch,
    batchSize,
    excludeSourceIds,
    force,
    sourceIds,
  }
}

function compactCronCrawlResult(result: CronCrawlResult) {
  return {
    mode: result.mode,
    checked: result.checked,
    selected: result.selected,
    due: result.due,
    crawled: result.crawled,
    batch: result.batch,
    filters: result.filters,
    failureNotificationCount: result.failureNotificationCount,
    results: result.results.map(({ source, run, post, snapshot }) => ({
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
  const authorizationError = getCronAuthorizationError(request)
  if (authorizationError) return jsonError(authorizationError, authorizationError.includes('CRON_SECRET') ? 503 : 401)

  try {
    return Response.json(compactCronCrawlResult(await crawlDueBbsSourcesForCron(getCronCrawlOptions(request))))
  } catch (error) {
    if (error instanceof RepositoryError && error.status === 503) {
      return Response.json({ mode: 'demo', checked: 0, crawled: 0, message: error.message })
    }
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : 'BBS巡回に失敗しました。', 400)
  }
}
