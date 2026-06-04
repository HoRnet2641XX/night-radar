export function getBaseUrl(request?: Request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (request) {
    const url = new URL(request.url)
    return `${url.protocol}//${url.host}`
  }
  return 'http://localhost:3000'
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
