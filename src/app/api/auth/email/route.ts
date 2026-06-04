import { z } from 'zod'
import { getBaseUrl, jsonError } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  email: z.string().email(),
})

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('Email is invalid.', 422, parsed.error.issues)

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return Response.json({
      ok: true,
      mode: 'demo',
      message: 'Supabase env is not configured. Email auth is running in demo mode.',
    })
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${getBaseUrl(request)}/api/auth/callback`,
    },
  })

  if (error) return jsonError(error.message, 400)
  return Response.json({ ok: true })
}
