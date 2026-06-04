import { z } from 'zod'
import { getBaseUrl, jsonError } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  provider: z.enum(['google', 'x']),
})

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('OAuth provider is invalid.', 422, parsed.error.issues)

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return Response.json({
      url: '/',
      mode: 'demo',
      message: 'Supabase env is not configured. OAuth is running in demo mode.',
    })
  }

  const baseUrl = getBaseUrl(request)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsed.data.provider,
    options: {
      redirectTo: `${baseUrl}/api/auth/callback`,
    },
  })

  if (error) return jsonError(error.message, 400)
  return Response.json({ url: data.url })
}
