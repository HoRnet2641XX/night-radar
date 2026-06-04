import { z } from 'zod'
import { jsonError } from '@/lib/env'
import { crawlUserBbsSources, RepositoryError } from '@/lib/server/repository'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  sourceIds: z.array(z.string().min(1)).optional(),
})

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('BBS crawl payload is invalid.', 422, parsed.error.issues)

  try {
    return Response.json(await crawlUserBbsSources(parsed.data.sourceIds))
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : 'BBS crawl failed.', 400)
  }
}
