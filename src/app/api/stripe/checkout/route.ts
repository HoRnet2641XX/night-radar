import { z } from 'zod'
import { getBaseUrl, jsonError } from '@/lib/env'
import { getCurrentUser } from '@/lib/supabase/server'
import { getStripe, getStripePriceId } from '@/lib/stripe/server'
import type { PlanKey } from '@/lib/types'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  plan: z.enum(['light', 'standard', 'premium']),
})

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('Plan is invalid.', 422, parsed.error.issues)

  const stripe = getStripe()
  const priceId = getStripePriceId(parsed.data.plan as PlanKey)
  if (!stripe || !priceId) {
    return Response.json({
      url: '/',
      mode: 'demo',
      message: 'StripeのキーまたはプランIDが未設定です。決済はまだ開始できません。',
    })
  }

  const user = await getCurrentUser()
  if (!user) return jsonError('Authentication required before checkout.', 401)

  const baseUrl = getBaseUrl(request)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: user.email ?? undefined,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/?billing=success`,
    cancel_url: `${baseUrl}/?billing=cancelled`,
    metadata: {
      user_id: user.id,
      plan: parsed.data.plan,
    },
    subscription_data: {
      metadata: {
        user_id: user.id,
        plan: parsed.data.plan,
      },
    },
  })

  return Response.json({ url: session.url })
}
