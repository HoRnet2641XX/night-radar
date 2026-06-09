import { z } from 'zod'
import { jsonError } from '@/lib/env'
import { RepositoryError, saveNotificationPreference } from '@/lib/server/repository'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  email: z.string().email().or(z.literal('')).default(''),
  webhookUrl: z.string().url().or(z.literal('')).default(''),
  channel: z.enum(['in_app', 'email', 'webhook']).default('in_app'),
  audience: z.enum(['free', 'light', 'standard', 'premium']).default('free'),
})

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('Notification preference payload is invalid.', 422, parsed.error.issues)

  try {
    return Response.json(await saveNotificationPreference(parsed.data))
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : 'Notification preference save failed.', 400)
  }
}
