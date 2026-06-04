import { z } from 'zod'
import { jsonError } from '@/lib/env'
import { RepositoryError, saveRecord } from '@/lib/server/repository'
import { scrapePublicPage, scrapeResultToPost } from '@/lib/server/scrape'
import type { PostRecord } from '@/lib/types'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  url: z.string().url(),
  storeId: z.string().optional(),
  persist: z.boolean().optional(),
})

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('Scrape payload is invalid.', 422, parsed.error.issues)

  const result = await scrapePublicPage(parsed.data.url)
  const post = parsed.data.storeId ? scrapeResultToPost(result, parsed.data.storeId) : null

  if (post && parsed.data.persist) {
    try {
      const saved = await saveRecord('posts', post)
      return Response.json({
        result,
        post: saved.item as PostRecord,
        mode: saved.mode,
        message: saved.message,
      })
    } catch (error) {
      if (error instanceof RepositoryError) return jsonError(error.message, error.status)
      return jsonError(error instanceof Error ? error.message : 'Scrape persistence failed.', 400)
    }
  }

  return Response.json({
    result,
    post,
  })
}
