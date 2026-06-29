import { z } from 'zod'
import { events as demoEvents, posts as demoPosts, stores as demoStores } from '@/lib/demo-data'
import { jsonError } from '@/lib/env'
import { highestAudienceForPlan, planRank } from '@/lib/plans'
import { requireAppUser } from '@/lib/server/auth-guard'
import {
  getCurrentNotificationDelivery,
  getDashboardState,
  RepositoryError,
  saveDispatchedNotifications,
} from '@/lib/server/repository'
import { buildSignalNotifications, dispatchNotification } from '@/lib/server/notifications'
import { scoreEvents } from '@/lib/scoring'
import type { NotificationChannel, PlanKey, ScoredEvent } from '@/lib/types'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  channel: z.enum(['in_app', 'email', 'webhook']).optional(),
  audience: z.enum(['free', 'light', 'standard', 'premium']).optional(),
  recipient: z.string().email().optional(),
  webhookUrl: z.string().url().optional(),
  events: z.array(z.any()).optional(),
})

export async function POST(request: Request) {
  const auth = await requireAppUser()
  if (auth.response) return auth.response

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('通知内容が不正です。', 422, parsed.error.issues)

  try {
    const delivery = await getCurrentNotificationDelivery()
    const channel = (parsed.data.channel ?? delivery.preference.channel) as NotificationChannel
    const requestedAudience = (parsed.data.audience ?? delivery.preference.audience) as PlanKey
    const audience =
      delivery.mode === 'database' && planRank[requestedAudience] > planRank[delivery.plan]
        ? highestAudienceForPlan(delivery.plan)
        : requestedAudience
    const recipient = parsed.data.recipient ?? delivery.preference.email
    const webhookUrl = parsed.data.webhookUrl ?? delivery.preference.webhookUrl
    const fallbackEvents = scoreEvents(demoEvents, demoStores, demoPosts)
    const state = parsed.data.events?.length ? null : await getDashboardState()
    const events = (parsed.data.events?.length ? parsed.data.events : state?.scoredEvents.length ? state.scoredEvents : fallbackEvents) as ScoredEvent[]
    const jobs = buildSignalNotifications(events, audience, channel)
    const dispatched = await Promise.all(jobs.map((job) => dispatchNotification(job, { recipient, webhookUrl })))
    const persisted = await saveDispatchedNotifications(dispatched)
    return Response.json({
      jobs: persisted.jobs,
      mode: persisted.mode,
      preference: delivery.preference,
    })
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : '通知履歴を保存できませんでした。', 400)
  }
}
