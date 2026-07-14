import { jsonError } from '@/lib/env'
import { getCronAuthorizationError } from '@/lib/server/cron-auth'
import { captureDueBbsScreenshotsForCron, RepositoryError } from '@/lib/server/repository'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  const authorizationError = getCronAuthorizationError(request, 'BBS実画面撮影')
  if (authorizationError) return jsonError(authorizationError, authorizationError.includes('CRON_SECRET') ? 503 : 401)

  try {
    const url = new URL(request.url)
    const force = ['1', 'true', 'yes'].includes((url.searchParams.get('force') ?? '').toLowerCase())
    const limitValue = Number(url.searchParams.get('limit') ?? 0)
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : undefined
    const startedAt = Date.now()
    const result = await captureDueBbsScreenshotsForCron({ force, limit })
    const failureCount = result.results.filter((item) => item.status === 'failed').length

    return Response.json(
      { ...result, elapsedMs: Date.now() - startedAt, failureCount },
      { status: failureCount > 0 ? 502 : 200 },
    )
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : 'BBS実画面撮影に失敗しました。', 500)
  }
}
