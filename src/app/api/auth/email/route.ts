import { z } from 'zod'
import { NextResponse } from 'next/server'
import { authErrorMessage, authNextCookie, authRedirectCookieOptions, safeNextPath } from '@/lib/auth-redirect'
import { getBaseUrl, jsonError } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  email: z.string().email(),
  next: z.string().optional(),
})

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('メールアドレスが不正です。', 422, parsed.error.issues)

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return Response.json({
      ok: true,
      mode: 'demo',
      message: 'Supabaseの設定がないため、メール認証はデモ表示です。',
    })
  }

  const baseUrl = getBaseUrl(request)
  const next = safeNextPath(parsed.data.next)
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${baseUrl}/api/auth/callback`,
    },
  })

  if (error) return jsonError(authErrorMessage(error.message), 400)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(authNextCookie, next, authRedirectCookieOptions(baseUrl))
  return response
}
