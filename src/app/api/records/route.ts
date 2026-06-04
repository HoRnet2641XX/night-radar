import { z } from 'zod'
import { jsonError } from '@/lib/env'
import { deleteRecord, RepositoryError, saveRecord } from '@/lib/server/repository'

export const runtime = 'nodejs'

const kindSchema = z.enum(['stores', 'events', 'posts', 'situations', 'bbsSources'])

const postPayloadSchema = z.object({
  kind: kindSchema,
  item: z.unknown(),
})

const deletePayloadSchema = z.object({
  kind: kindSchema,
  id: z.string().min(1),
})

function handleRepositoryError(error: unknown) {
  if (error instanceof RepositoryError) return jsonError(error.message, error.status)
  return jsonError(error instanceof Error ? error.message : 'Record operation failed.', 400)
}

export async function POST(request: Request) {
  const parsed = postPayloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('Record payload is invalid.', 422, parsed.error.issues)

  try {
    return Response.json(await saveRecord(parsed.data.kind, parsed.data.item))
  } catch (error) {
    return handleRepositoryError(error)
  }
}

export async function DELETE(request: Request) {
  const parsed = deletePayloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('Delete payload is invalid.', 422, parsed.error.issues)

  try {
    return Response.json(await deleteRecord(parsed.data.kind, parsed.data.id))
  } catch (error) {
    return handleRepositoryError(error)
  }
}
