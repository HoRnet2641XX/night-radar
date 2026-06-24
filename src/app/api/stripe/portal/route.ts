import { getBaseUrl, jsonError } from '@/lib/env'
import { getCurrentSubscriptionForCheckout } from '@/lib/server/repository'
import { getStripe } from '@/lib/stripe/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const stripe = getStripe()
  if (!stripe) {
    return Response.json({
      url: '/',
      mode: 'demo',
      message: 'Stripeのキーが未設定です。請求ポータルはまだ開けません。',
    })
  }

  const current = await getCurrentSubscriptionForCheckout()
  if (!current) return jsonError('Authentication required before opening billing portal.', 401)
  if (!current.subscription.stripeCustomerId) return jsonError('Stripe customer is not linked yet.', 404)

  const session = await stripe.billingPortal.sessions.create({
    customer: current.subscription.stripeCustomerId,
    return_url: getBaseUrl(request),
  })

  return Response.json({ url: session.url })
}
