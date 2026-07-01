import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { authNextCookie, safeNextPath } from '@/lib/auth-redirect'
import { getBaseUrl, hasSupabaseEnv } from '@/lib/env'

export const runtime = 'nodejs'

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

function redirectToLoginWithError(request: NextRequest, error: string, next: string) {
  const loginUrl = new URL('/login', getBaseUrl(request))
  loginUrl.searchParams.set('error', error)
  if (next !== '/') loginUrl.searchParams.set('next', next)

  const response = NextResponse.redirect(loginUrl)
  response.cookies.delete(authNextCookie)
  return response
}

function createCallbackSupabaseClient(request: NextRequest, cookiesToSet: CookieToSet[]) {
  if (!hasSupabaseEnv()) return null

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(nextCookies) {
        cookiesToSet.push(...nextCookies)
      },
    },
  })
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

  const cookiesToSet: CookieToSet[] = []
  const supabase = createCallbackSupabaseClient(request, cookiesToSet)
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
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  response.cookies.delete(authNextCookie)
  return response
}
