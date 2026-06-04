import Stripe from 'stripe'
import { plans } from '../demo-data'
import type { PlanKey } from '../types'

let stripeClient: Stripe | null = null

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    appInfo: {
      name: 'Night Radar',
      version: '0.1.0',
    },
  })
  return stripeClient
}

export function getStripePriceId(plan: PlanKey) {
  const planConfig = plans.find((item) => item.key === plan)
  if (!planConfig?.stripePriceEnv) return null
  return process.env[planConfig.stripePriceEnv] ?? null
}
