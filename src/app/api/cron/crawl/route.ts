import { jsonError } from '@/lib/env'
import { crawlDueBbsSourcesForCron, RepositoryError } from '@/lib/server/repository'

export const runtime = 'nodejs'

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

function compactCronCrawlResult(result: CronCrawlResult) {
  return {
    mode: result.mode,
    checked: result.checked,
    crawled: result.crawled,
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

export async function GET(request: Request) {
  const authorizationError = getCronAuthorizationError(request)
  if (authorizationError) return jsonError(authorizationError, authorizationError.includes('CRON_SECRET') ? 503 : 401)

  try {
    return Response.json(compactCronCrawlResult(await crawlDueBbsSourcesForCron()))
  } catch (error) {
    if (error instanceof RepositoryError && error.status === 503) {
      return Response.json({ mode: 'demo', checked: 0, crawled: 0, message: error.message })
    }
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : 'Cron crawl failed.', 400)
  }
}
