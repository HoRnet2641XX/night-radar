import { z } from 'zod'
import { jsonError } from '@/lib/env'
import { requireAppUser } from '@/lib/server/auth-guard'
import { RepositoryError, saveAndSearchExactTerms } from '@/lib/server/repository'
import type { PostRecord, StoreProfile } from '@/lib/types'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  exactTerms: z.object({
    popularSingleMale: z.string().default(''),
    popularSingleFemale: z.string().default(''),
    negativePerson: z.string().default(''),
  }),
  stores: z.array(z.any()).optional(),
  posts: z.array(z.any()).optional(),
})

export async function POST(request: Request) {
  const auth = await requireAppUser()
  if (auth.response) return auth.response

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('完全一致検索の条件が不正です。', 422, parsed.error.issues)

  try {
    return Response.json(
      await saveAndSearchExactTerms(parsed.data.exactTerms, {
        stores: parsed.data.stores as StoreProfile[] | undefined,
        posts: parsed.data.posts as PostRecord[] | undefined,
      }),
    )
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : '完全一致検索に失敗しました。', 400)
  }
}
