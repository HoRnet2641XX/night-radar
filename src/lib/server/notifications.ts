import { Resend } from 'resend'
import { planLimits } from '../plans'
import type { NotificationChannel, NotificationJob, PlanKey, ScoredEvent } from '../types'

export type OperationalAlert = {
  title: string
  body: string
  severity?: 'warning' | 'error'
  details?: Record<string, unknown>
}

export type OperationalAlertResult = {
  status: 'sent' | 'failed' | 'unconfigured'
  destination?: 'slack' | 'discord' | 'generic'
}

export function buildSignalNotifications(events: ScoredEvent[], audience: PlanKey, channel: NotificationChannel) {
  return events.slice(0, planLimits[audience].notificationJobs).map((event) => ({
    id: `today-candidate-${event.id}-${channel}`,
    title: `今日の候補: ${event.store.name}`,
    body: `今日18:00時点の候補です。${event.date} ${event.startsAt} / ${event.store.name} / ${event.title}。判断スコア ${event.score}。根拠: ${event.reasons.join(' / ')}`,
    channel,
    audience,
    scheduledFor: new Date().toISOString(),
    status: 'queued',
  })) satisfies NotificationJob[]
}

export async function dispatchNotification(job: NotificationJob, options?: { recipient?: string; webhookUrl?: string }) {
  try {
    if (job.channel === 'email' && process.env.RESEND_API_KEY && options?.recipient) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: process.env.NOTIFICATION_FROM_EMAIL ?? 'Night Radar <notifications@example.com>',
        to: options.recipient,
        subject: job.title,
        text: job.body,
      })
      return { ...job, status: 'sent' as const }
    }

    const webhookUrl = options?.webhookUrl || process.env.NOTIFICATION_WEBHOOK_URL
    if (job.channel === 'webhook' && webhookUrl) {
      const response = await fetch(webhookUrl, {
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

export async function dispatchOperationalAlert(
  alert: OperationalAlert,
  options?: { webhookUrl?: string },
): Promise<OperationalAlertResult> {
  const webhookUrl =
    options?.webhookUrl || process.env.OPERATION_ALERT_WEBHOOK_URL || process.env.NOTIFICATION_WEBHOOK_URL
  if (!webhookUrl) return { status: 'unconfigured' }

  try {
    const hostname = new URL(webhookUrl).hostname.toLowerCase()
    const severity = alert.severity === 'warning' ? '警告' : '異常'
    const detailText = alert.details
      ? Object.entries(alert.details)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join('\n')
      : ''
    const text = [`[Night Radar / ${severity}] ${alert.title}`, alert.body, detailText]
      .filter(Boolean)
      .join('\n')
    const destination = hostname.includes('discord.com') || hostname.includes('discordapp.com')
      ? 'discord'
      : hostname === 'hooks.slack.com'
        ? 'slack'
        : 'generic'
    const payload = destination === 'discord'
      ? { content: text.slice(0, 2_000) }
      : destination === 'slack'
        ? { text }
        : { source: 'night-radar', ...alert, text }
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    })
    return { status: response.ok ? 'sent' : 'failed', destination }
  } catch {
    return { status: 'failed' }
  }
}
