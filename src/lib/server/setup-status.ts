import type { ServiceSetupStatus, SetupStatusItem, SetupStatusTone } from '../types'

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim())
}

function item(id: string, label: string, tone: SetupStatusTone, summary: string, detail: string): SetupStatusItem {
  return { id, label, tone, summary, detail }
}

function countTone(items: SetupStatusItem[], tone: SetupStatusTone) {
  return items.filter((entry) => entry.tone === tone).length
}

export function getServiceSetupStatus(): ServiceSetupStatus {
  const hasSupabasePublic = hasEnv('NEXT_PUBLIC_SUPABASE_URL') && hasEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  const hasSupabaseAdmin = hasEnv('SUPABASE_SERVICE_ROLE_KEY')
  const stripePriceCount = ['STRIPE_PRICE_LIGHT', 'STRIPE_PRICE_STANDARD', 'STRIPE_PRICE_PREMIUM'].filter(hasEnv).length
  const hasStripeCore = hasEnv('STRIPE_SECRET_KEY') && hasEnv('STRIPE_WEBHOOK_SECRET')
  const hasNotificationDelivery = hasEnv('RESEND_API_KEY') || hasEnv('NOTIFICATION_WEBHOOK_URL')
  const hasBasicAuth = hasEnv('BASIC_AUTH_USER') && hasEnv('BASIC_AUTH_PASSWORD')
  const screenshotsDisabled = process.env.DISABLE_BROWSER_SCREENSHOTS === 'true'

  const items = [
    item(
      'supabase',
      'Supabase',
      hasSupabasePublic && hasSupabaseAdmin ? 'ready' : 'action',
      hasSupabasePublic && hasSupabaseAdmin ? 'DB接続済み' : 'DB設定が不足',
      hasSupabasePublic && hasSupabaseAdmin
        ? '公開キーとService Roleが揃っています。店舗・BBS・巡回データを保存できます。'
        : 'NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY、SUPABASE_SERVICE_ROLE_KEYを確認してください。',
    ),
    item(
      'auth',
      'ログイン',
      hasSupabasePublic ? 'check' : 'action',
      hasSupabasePublic ? 'Provider確認待ち' : 'Supabase未接続',
      hasSupabasePublic
        ? 'メール、Google、XのProvider設定はSupabase管理画面側で確認が必要です。'
        : 'ログイン機能にはSupabaseの公開URLとPublishable Keyが必要です。',
    ),
    item(
      'cron',
      'BBS定期巡回',
      hasEnv('CRON_SECRET') ? 'ready' : 'action',
      hasEnv('CRON_SECRET') ? '保護済み' : '本番前に必須',
      hasEnv('CRON_SECRET')
        ? '外部CronからAuthorizationヘッダー付きで実行できます。'
        : 'CRON_SECRETがない本番環境では巡回APIを拒否します。外部Cron設定前に必ず入れてください。',
    ),
    item(
      'scrape',
      '巡回対象制限',
      hasEnv('SCRAPE_ALLOWED_HOSTS') ? 'ready' : 'check',
      hasEnv('SCRAPE_ALLOWED_HOSTS') ? '許可ホスト指定済み' : '公開URL全般を許可',
      hasEnv('SCRAPE_ALLOWED_HOSTS')
        ? '指定したホストだけを巡回対象にします。'
        : 'ローカル/プライベートIPは拒否しますが、本番運用では対象ホストの明示を推奨します。',
    ),
    item(
      'screenshots',
      'スクショ巡回',
      screenshotsDisabled ? 'off' : 'check',
      screenshotsDisabled ? '無効化中' : 'Playwright有効',
      screenshotsDisabled
        ? 'テキスト取得とレーダー算出のみ行います。'
        : 'ローカルでは有効です。本番ランタイムでChromiumが起動できるか検証してください。',
    ),
    item(
      'stripe',
      'Stripe決済',
      hasStripeCore && stripePriceCount === 3 ? 'ready' : 'action',
      hasStripeCore && stripePriceCount === 3 ? '接続済み' : `未設定 ${3 - stripePriceCount}件`,
      hasStripeCore && stripePriceCount === 3
        ? 'Checkout、Webhook、3プランのPrice IDが揃っています。'
        : 'STRIPE_SECRET_KEY、STRIPE_WEBHOOK_SECRET、各プランのPrice IDを設定してください。',
    ),
    item(
      'ai',
      'AI分析',
      hasEnv('OPENAI_API_KEY') ? 'ready' : 'check',
      hasEnv('OPENAI_API_KEY') ? 'AI接続済み' : '簡易分析で代替',
      hasEnv('OPENAI_API_KEY')
        ? 'OpenAI APIを使った分析を実行します。失敗時は簡易分析へ戻します。'
        : 'OPENAI_API_KEYがないため、現在はルールベースの簡易分析です。',
    ),
    item(
      'notifications',
      '通知配信',
      hasNotificationDelivery ? 'ready' : 'check',
      hasNotificationDelivery ? '外部配信可能' : 'アプリ内のみ',
      hasNotificationDelivery
        ? 'ResendまたはWebhookで外部通知を送信できます。'
        : 'メール/Webhookは試行記録になります。実配信にはRESEND_API_KEYかNOTIFICATION_WEBHOOK_URLが必要です。',
    ),
    item(
      'basic-auth',
      'Basic認証',
      hasBasicAuth ? 'ready' : 'check',
      hasBasicAuth ? '有効化可能' : '未設定',
      hasBasicAuth
        ? 'Vercel本番環境でも同じ値を設定すれば、Supabaseログイン前に全体を保護できます。'
        : 'クローズド公開にする場合はBASIC_AUTH_USERとBASIC_AUTH_PASSWORDを設定してください。',
    ),
  ]

  return {
    generatedAt: new Date().toISOString(),
    actionCount: countTone(items, 'action'),
    checkCount: countTone(items, 'check'),
    items,
  }
}
