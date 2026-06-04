import type Stripe from 'stripe'
import { jsonError } from '@/lib/env'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = request.headers.get('stripe-signature')

  if (!stripe || !webhookSecret || !signature) return jsonError('Stripe webhook is not configured.', 400)

  const rawBody = await request.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Invalid Stripe signature.', 400)
  }

  const supabase = createSupabaseAdminClient()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.user_id
    const plan = session.metadata?.plan

    if (supabase && userId && plan) {
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan,
        stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
        stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription
    const userId = subscription.metadata?.user_id
    const plan = subscription.metadata?.plan

    if (supabase && userId && plan) {
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan,
        stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        updated_at: new Date().toISOString(),
      })
    }
  }

  await supabase?.from('stripe_events').insert({
    id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  })

  return Response.json({ received: true })
}
