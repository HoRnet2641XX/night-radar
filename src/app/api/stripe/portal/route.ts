import { getBaseUrl, jsonError } from '@/lib/env'
import { getCurrentSubscriptionForCheckout } from '@/lib/server/repository'
import { getStripe } from '@/lib/stripe/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const current = await getCurrentSubscriptionForCheckout()
  if (!current) return jsonError('請求ポータルを開くにはログインが必要です。', 401)

  const stripe = getStripe()
  if (!stripe) {
    return Response.json({
      url: '/',
      mode: 'demo',
      message: 'Stripeのキーが未設定です。請求ポータルはまだ開けません。',
    })
  }

  if (!current.subscription.stripeCustomerId) return jsonError('請求情報がまだ紐づいていません。', 404)

  const session = await stripe.billingPortal.sessions.create({
    customer: current.subscription.stripeCustomerId,
    return_url: getBaseUrl(request),
  })

  return Response.json({ url: session.url })
}
