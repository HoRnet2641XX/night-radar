import { z } from 'zod'
import { jsonError } from '@/lib/env'
import { requireAppUser } from '@/lib/server/auth-guard'
import { RepositoryError, saveUserStoreDecision } from '@/lib/server/repository'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  storeId: z.string().min(1),
  decision: z.enum(['candidate', 'favorite', 'watch', 'hidden']).default('watch'),
})

export async function POST(request: Request) {
  const auth = await requireAppUser()
  if (auth.response) return auth.response

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('店舗候補の保存内容が不正です。', 422, parsed.error.issues)

  try {
    return Response.json(await saveUserStoreDecision(parsed.data))
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : '店舗候補を保存できません。', 400)
  }
}
