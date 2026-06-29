import { z } from 'zod'
import { jsonError } from '@/lib/env'
import { requireAppUser } from '@/lib/server/auth-guard'
import { deleteWordBookmark, RepositoryError, saveWordBookmark } from '@/lib/server/repository'

export const runtime = 'nodejs'

const bookmarkSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  pattern: z.string().min(1),
  matchType: z.enum(['exact', 'regex', 'emoji']).default('exact'),
})

const deleteSchema = z.object({
  id: z.string().min(1),
})

export async function POST(request: Request) {
  const auth = await requireAppUser()
  if (auth.response) return auth.response

  const parsed = bookmarkSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('注目ワードの内容が不正です。', 422, parsed.error.issues)

  try {
    return Response.json(await saveWordBookmark(parsed.data))
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : '注目ワードを保存できませんでした。', 400)
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAppUser()
  if (auth.response) return auth.response

  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('削除する注目ワードが不正です。', 422, parsed.error.issues)

  try {
    return Response.json(await deleteWordBookmark(parsed.data.id))
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : '注目ワードを削除できませんでした。', 400)
  }
}
