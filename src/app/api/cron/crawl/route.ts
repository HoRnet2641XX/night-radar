import { jsonError } from '@/lib/env'
import { crawlDueBbsSourcesForCron, RepositoryError } from '@/lib/server/repository'

export const runtime = 'nodejs'

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return jsonError('Unauthorized cron request.', 401)

  try {
    return Response.json(await crawlDueBbsSourcesForCron())
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : 'Cron crawl failed.', 400)
  }
}
