import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchOperationalAlert } from './notifications'

test('operator alert remains unconfigured without a webhook', async () => {
  const previousOperationUrl = process.env.OPERATION_ALERT_WEBHOOK_URL
  const previousNotificationUrl = process.env.NOTIFICATION_WEBHOOK_URL
  delete process.env.OPERATION_ALERT_WEBHOOK_URL
  delete process.env.NOTIFICATION_WEBHOOK_URL
  try {
    assert.deepEqual(
      await dispatchOperationalAlert({ title: '巡回異常', body: '解析件数が急減しました。' }),
      { status: 'unconfigured' },
    )
  } finally {
    if (previousOperationUrl) process.env.OPERATION_ALERT_WEBHOOK_URL = previousOperationUrl
    if (previousNotificationUrl) process.env.NOTIFICATION_WEBHOOK_URL = previousNotificationUrl
  }
})

test('operator alert uses the Slack payload shape', async () => {
  const previousFetch = globalThis.fetch
  let requestBody = ''
  globalThis.fetch = (async (_input, init) => {
    requestBody = String(init?.body ?? '')
    return new Response(null, { status: 200 })
  }) as typeof fetch
  try {
    const result = await dispatchOperationalAlert(
      { title: '巡回異常', body: '解析件数が急減しました。', severity: 'error' },
      { webhookUrl: 'https://hooks.slack.com/services/example' },
    )
    assert.deepEqual(result, { status: 'sent', destination: 'slack' })
    assert.match(JSON.parse(requestBody).text, /解析件数が急減/)
  } finally {
    globalThis.fetch = previousFetch
  }
})
