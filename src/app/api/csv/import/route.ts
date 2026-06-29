import { z } from 'zod'
import { parseCsvText } from '@/lib/csv'
import { jsonError } from '@/lib/env'
import { requireAppUser } from '@/lib/server/auth-guard'
import { persistCsvItems, RepositoryError } from '@/lib/server/repository'
import type { EventInput, PostRecord, StoreProfile } from '@/lib/types'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  kind: z.enum(['stores', 'events', 'posts']),
  text: z.string().min(1),
  persist: z.boolean().optional(),
})

export async function POST(request: Request) {
  const auth = await requireAppUser()
  if (auth.response) return auth.response

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('CSV取り込み内容が不正です。', 422, parsed.error.issues)

  const result = parseCsvText(parsed.data.text, parsed.data.kind)
  if (!parsed.data.persist || result.errors.length) return Response.json(result)

  try {
    const persisted = await persistCsvItems(
      parsed.data.kind,
      result.items as Array<StoreProfile | EventInput | PostRecord>,
      result.errors,
    )
    return Response.json({
      ...result,
      ...persisted,
    })
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : 'CSVの保存に失敗しました。', 400)
  }
}
