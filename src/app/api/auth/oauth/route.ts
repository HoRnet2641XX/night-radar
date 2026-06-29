import { z } from 'zod'
import { NextResponse } from 'next/server'
import { authErrorMessage, authNextCookie, authRedirectCookieOptions, safeNextPath } from '@/lib/auth-redirect'
import { getBaseUrl, jsonError } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  provider: z.enum(['google', 'x']),
  next: z.string().optional(),
})

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('ログイン方法が不正です。', 422, parsed.error.issues)

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return Response.json({
      url: '/',
      mode: 'demo',
      message: 'Supabaseの設定がないため、外部ログインはデモ表示です。',
    })
  }

  const baseUrl = getBaseUrl(request)
  const next = safeNextPath(parsed.data.next)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsed.data.provider,
    options: {
      redirectTo: `${baseUrl}/api/auth/callback`,
    },
  })

  if (error) return jsonError(authErrorMessage(error.message), 400)
  const response = NextResponse.json({ url: data.url })
  response.cookies.set(authNextCookie, next, authRedirectCookieOptions(baseUrl))
  return response
}
