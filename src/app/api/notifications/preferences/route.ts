import { z } from 'zod'
import { jsonError } from '@/lib/env'
import { requireAppUser } from '@/lib/server/auth-guard'
import { RepositoryError, saveNotificationPreference } from '@/lib/server/repository'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  email: z.string().email().or(z.literal('')).default(''),
  webhookUrl: z.string().url().or(z.literal('')).default(''),
  channel: z.enum(['in_app', 'email', 'webhook']).default('in_app'),
  audience: z.enum(['free', 'light', 'standard', 'premium']).default('free'),
})

export async function POST(request: Request) {
  const auth = await requireAppUser()
  if (auth.response) return auth.response

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('通知設定の内容が不正です。', 422, parsed.error.issues)

  try {
    return Response.json(await saveNotificationPreference(parsed.data))
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : '通知設定を保存できませんでした。', 400)
  }
}
