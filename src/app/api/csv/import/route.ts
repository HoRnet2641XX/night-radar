import { z } from 'zod'
import { parseCsvText } from '@/lib/csv'
import { jsonError } from '@/lib/env'
import { persistCsvItems, RepositoryError } from '@/lib/server/repository'
import type { EventInput, PostRecord, StoreProfile } from '@/lib/types'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  kind: z.enum(['stores', 'events', 'posts']),
  text: z.string().min(1),
  persist: z.boolean().optional(),
})

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('CSV payload is invalid.', 422, parsed.error.issues)

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
    return jsonError(error instanceof Error ? error.message : 'CSV persistence failed.', 400)
  }
}
