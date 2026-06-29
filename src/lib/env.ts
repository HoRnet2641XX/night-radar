export function getBaseUrl(request?: Request) {
  if (request) {
    const url = new URL(request.url)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]') {
      return `${url.protocol}//${url.host}`
    }
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (request) {
    const url = new URL(request.url)
    return `${url.protocol}//${url.host}`
  }
  return 'http://localhost:3010'
}

export function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
}

export function hasStripeEnv() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return Response.json({ error: message, details }, { status })
}
