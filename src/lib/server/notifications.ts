import { Resend } from 'resend'
import type { NotificationChannel, NotificationJob, PlanKey, ScoredEvent } from '../types'

export function buildSignalNotifications(events: ScoredEvent[], audience: PlanKey, channel: NotificationChannel) {
  return events.slice(0, audience === 'free' ? 2 : audience === 'light' ? 5 : 12).map((event) => ({
    id: `notice-${event.id}-${channel}`,
    title: `${event.store.name} / ${event.title}`,
    body: `${event.date} ${event.startsAt}、公開シグナル期待度 ${event.score}。${event.reasons.join(' / ')}`,
    channel,
    audience,
    scheduledFor: new Date().toISOString(),
    status: 'queued',
  })) satisfies NotificationJob[]
}

export async function dispatchNotification(job: NotificationJob, recipient?: string) {
  try {
    if (job.channel === 'email' && process.env.RESEND_API_KEY && recipient) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: process.env.NOTIFICATION_FROM_EMAIL ?? 'Night Radar <notifications@example.com>',
        to: recipient,
        subject: job.title,
        text: job.body,
      })
      return { ...job, status: 'sent' as const }
    }

    if (job.channel === 'webhook' && process.env.NOTIFICATION_WEBHOOK_URL) {
      const response = await fetch(process.env.NOTIFICATION_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(job),
      })
      return { ...job, status: response.ok ? ('sent' as const) : ('failed' as const) }
    }

    if (job.channel === 'in_app') return { ...job, status: 'sent' as const }
    return { ...job, status: 'dry_run' as const }
  } catch {
    return { ...job, status: 'failed' as const }
  }
}
