import { NextResponse, type NextRequest } from 'next/server'
import { authNextCookie, safeNextPath } from '@/lib/auth-redirect'
import { getBaseUrl } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function redirectToLoginWithError(request: NextRequest, error: string, next: string) {
  const loginUrl = new URL('/login', getBaseUrl(request))
  loginUrl.searchParams.set('error', error)
  if (next !== '/') loginUrl.searchParams.set('next', next)

  const response = NextResponse.redirect(loginUrl)
  response.cookies.delete(authNextCookie)
  return response
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const providerError = requestUrl.searchParams.get('error')
  const next = safeNextPath(requestUrl.searchParams.get('next') ?? request.cookies.get(authNextCookie)?.value)

  if (providerError) {
    return redirectToLoginWithError(request, providerError === 'access_denied' ? 'oauth_cancelled' : 'oauth_failed', next)
  }

  if (!code) {
    return redirectToLoginWithError(request, 'missing_code', next)
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return redirectToLoginWithError(request, 'auth_config_missing', next)
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return redirectToLoginWithError(request, 'session_exchange_failed', next)
  }

  const completeUrl = new URL('/auth/complete', getBaseUrl(request))
  completeUrl.searchParams.set('next', next)

  const response = NextResponse.redirect(completeUrl)
  response.cookies.delete(authNextCookie)
  return response
}
