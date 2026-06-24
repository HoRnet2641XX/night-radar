import { NextResponse, type NextRequest } from 'next/server'

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Night Radar"',
    },
  })
}

export function proxy(request: NextRequest) {
  const username = process.env.BASIC_AUTH_USER
  const password = process.env.BASIC_AUTH_PASSWORD

  if (request.nextUrl.pathname === '/api/cron/crawl' || request.nextUrl.pathname === '/api/stripe/webhook') {
    return NextResponse.next()
  }

  if (!username || !password) return NextResponse.next()

  const authorization = request.headers.get('authorization')
  if (!authorization) return unauthorized()

  const [scheme, encoded] = authorization.split(' ')
  if (scheme !== 'Basic' || !encoded) return unauthorized()

  try {
    const decoded = atob(encoded)
    const separatorIndex = decoded.indexOf(':')
    if (separatorIndex < 0) return unauthorized()

    const suppliedUsername = decoded.slice(0, separatorIndex)
    const suppliedPassword = decoded.slice(separatorIndex + 1)

    if (suppliedUsername === username && suppliedPassword === password) {
      return NextResponse.next()
    }
  } catch {
    return unauthorized()
  }

  return unauthorized()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)'],
}
