import { z } from 'zod'
import { events as demoEvents, posts as demoPosts, stores as demoStores } from '@/lib/demo-data'
import { jsonError } from '@/lib/env'
import { getDashboardState, RepositoryError, saveDispatchedNotifications } from '@/lib/server/repository'
import { buildSignalNotifications, dispatchNotification } from '@/lib/server/notifications'
import { scoreEvents } from '@/lib/scoring'
import type { NotificationChannel, PlanKey, ScoredEvent } from '@/lib/types'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  channel: z.enum(['in_app', 'email', 'webhook']).default('in_app'),
  audience: z.enum(['free', 'light', 'standard', 'premium']).default('free'),
  recipient: z.string().email().optional(),
  events: z.array(z.any()).optional(),
})

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('Notification payload is invalid.', 422, parsed.error.issues)

  const fallbackEvents = scoreEvents(demoEvents, demoStores, demoPosts)
  const state = parsed.data.events?.length ? null : await getDashboardState()
  const events = (parsed.data.events?.length ? parsed.data.events : state?.scoredEvents.length ? state.scoredEvents : fallbackEvents) as ScoredEvent[]
  const jobs = buildSignalNotifications(
    events,
    parsed.data.audience as PlanKey,
    parsed.data.channel as NotificationChannel,
  )
  const dispatched = await Promise.all(jobs.map((job) => dispatchNotification(job, parsed.data.recipient)))

  try {
    const persisted = await saveDispatchedNotifications(dispatched)
    return Response.json({
      jobs: persisted.jobs,
      mode: persisted.mode,
    })
  } catch (error) {
    if (error instanceof RepositoryError) return jsonError(error.message, error.status)
    return jsonError(error instanceof Error ? error.message : 'Notification persistence failed.', 400)
  }
}
