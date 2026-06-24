import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const envArg = args.find((arg) => arg.startsWith('--env='))
const urlArg = args.find((arg) => arg.startsWith('--url='))
const envPath = path.resolve(envArg?.slice('--env='.length) || '.env.local')
const appUrl = urlArg?.slice('--url='.length)

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return new Map()
  const env = new Map()
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index === -1) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    env.set(key, value)
  }
  return env
}

const env = parseEnvFile(envPath)
const has = (name) => Boolean(env.get(name)?.trim())
const count = (names) => names.filter(has).length

const checks = [
  {
    label: 'Supabase',
    ok: has('NEXT_PUBLIC_SUPABASE_URL') && has('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') && has('SUPABASE_SERVICE_ROLE_KEY'),
    required: true,
    detail: 'URL / Publishable Key / Service Role',
  },
  {
    label: 'Cron保護',
    ok: has('CRON_SECRET'),
    required: true,
    detail: 'CRON_SECRET',
  },
  {
    label: '巡回対象制限',
    ok: has('SCRAPE_ALLOWED_HOSTS'),
    required: false,
    detail: 'SCRAPE_ALLOWED_HOSTS',
  },
  {
    label: 'Stripe決済',
    ok:
      has('STRIPE_SECRET_KEY') &&
      has('STRIPE_WEBHOOK_SECRET') &&
      count(['STRIPE_PRICE_LIGHT', 'STRIPE_PRICE_STANDARD', 'STRIPE_PRICE_PREMIUM']) === 3,
    required: false,
    detail: 'Secret / Webhook / 3 Price IDs',
  },
  {
    label: 'AI分析',
    ok: has('OPENAI_API_KEY'),
    required: false,
    detail: 'OPENAI_API_KEY',
  },
  {
    label: '外部通知',
    ok: has('RESEND_API_KEY') || has('NOTIFICATION_WEBHOOK_URL'),
    required: false,
    detail: 'RESEND_API_KEY or NOTIFICATION_WEBHOOK_URL',
  },
  {
    label: 'Basic認証',
    ok: has('BASIC_AUTH_USER') && has('BASIC_AUTH_PASSWORD'),
    required: false,
    detail: 'BASIC_AUTH_USER / BASIC_AUTH_PASSWORD',
  },
]

console.log(`Night Radar readiness: ${envPath}`)
for (const check of checks) {
  const mark = check.ok ? 'OK' : check.required ? 'ACTION' : 'CHECK'
  console.log(`${mark.padEnd(6)} ${check.label} - ${check.detail}`)
}

if (appUrl) {
  try {
    const response = await fetch(appUrl, { method: 'HEAD' })
    console.log(`${response.ok ? 'OK' : 'CHECK '} 起動確認 - ${appUrl} (${response.status})`)
  } catch (error) {
    console.log(`ACTION 起動確認 - ${appUrl} (${error instanceof Error ? error.message : 'failed'})`)
    if (strict) process.exitCode = 1
  }
}

const requiredMissing = checks.filter((check) => check.required && !check.ok)
if (requiredMissing.length) {
  console.log(`\n必須設定の不足: ${requiredMissing.map((check) => check.label).join('、')}`)
  if (strict) process.exitCode = 1
}
