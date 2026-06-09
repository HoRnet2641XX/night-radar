import type { PlanKey } from './types'

export type PlanLimits = {
  csvRows: number
  bbsSources: number
  exactTermsPerGroup: number
  notificationJobs: number
  crawlSourcesPerRun: number
}

export const planRank: Record<PlanKey, number> = {
  free: 0,
  light: 1,
  standard: 2,
  premium: 3,
}

export const planLimits: Record<PlanKey, PlanLimits> = {
  free: {
    csvRows: 30,
    bbsSources: 1,
    exactTermsPerGroup: 1,
    notificationJobs: 2,
    crawlSourcesPerRun: 1,
  },
  light: {
    csvRows: 200,
    bbsSources: 5,
    exactTermsPerGroup: 3,
    notificationJobs: 5,
    crawlSourcesPerRun: 5,
  },
  standard: {
    csvRows: 1000,
    bbsSources: 20,
    exactTermsPerGroup: 10,
    notificationJobs: 12,
    crawlSourcesPerRun: 20,
  },
  premium: {
    csvRows: 5000,
    bbsSources: 60,
    exactTermsPerGroup: 30,
    notificationJobs: 30,
    crawlSourcesPerRun: 60,
  },
}

export function normalizePlan(value?: string | null): PlanKey {
  return value === 'light' || value === 'standard' || value === 'premium' ? value : 'free'
}

export function canUsePlan(current: PlanKey, required: PlanKey) {
  return planRank[current] >= planRank[required]
}

export function highestAudienceForPlan(plan: PlanKey): PlanKey {
  if (canUsePlan(plan, 'premium')) return 'premium'
  if (canUsePlan(plan, 'standard')) return 'standard'
  if (canUsePlan(plan, 'light')) return 'light'
  return 'free'
}

export function planLimitMessage(plan: PlanKey, feature: keyof PlanLimits) {
  const limit = planLimits[plan][feature]
  return `${plan}プランの上限は${limit}件です。`
}
