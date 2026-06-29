import { z } from 'zod'
import { jsonError } from '@/lib/env'
import { requireAppUser } from '@/lib/server/auth-guard'
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
  const auth = await requireAppUser()
  if (auth.response) return auth.response

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('巡回対象の内容が不正です。', 422, parsed.error.issues)

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
      return jsonError(error instanceof Error ? error.message : '巡回結果を保存できませんでした。', 400)
    }
  }

  return Response.json({
    result,
    post,
  })
}
