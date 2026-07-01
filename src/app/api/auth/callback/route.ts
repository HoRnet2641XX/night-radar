import { NextResponse, type NextRequest } from 'next/server'
import { authNextCookie, safeNextPath } from '@/lib/auth-redirect'
import { getBaseUrl } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = safeNextPath(requestUrl.searchParams.get('next') ?? request.cookies.get(authNextCookie)?.value)

  if (code) {
    const supabase = await createSupabaseServerClient()
    await supabase?.auth.exchangeCodeForSession(code)
  }

  const completeUrl = new URL('/auth/complete', getBaseUrl(request))
  completeUrl.searchParams.set('next', next)

  const response = NextResponse.redirect(completeUrl)
  response.cookies.delete(authNextCookie)
  return response
}
