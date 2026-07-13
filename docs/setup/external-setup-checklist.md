# Night Radar external setup checklist

このアプリをデモではなく実データで確認するために、ユーザー側で用意する項目です。

## 1. Supabase

Dashboard: https://supabase.com/dashboard/projects

1. Supabaseで新規Projectを作成する。
2. Project Settings > API から以下を控える。
   - Project URL -> `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable/anon key -> `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - service_role key -> `SUPABASE_SERVICE_ROLE_KEY`
3. SQL Editorで `supabase/schema.sql` を実行する。
4. 既に古いユーザー所有型schemaを適用済みの場合は、続けて `supabase/migrations/20260611_shared_catalog.sql` を実行する。
5. 実店舗カタログを入れる場合は `supabase/seed-store-catalog.sql` を実行する。
6. テスト用の共通カタログだけでよい場合は `supabase/seed-demo-catalog.sql` を実行する。
7. Authentication > URL Configuration を開く。
   - Site URL local: `http://localhost:3010`
   - Site URL production: `https://YOUR_VERCEL_DOMAIN`
   - Redirect URLs:
     - `http://localhost:3010/api/auth/callback`
     - `https://YOUR_VERCEL_DOMAIN/api/auth/callback`

## 2. Google OAuth

Google Cloud Console: https://console.cloud.google.com/apis/credentials

1. OAuth Client IDを作成する。
2. Authorized redirect URIにSupabaseのCallback URLを設定する。
   - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. 作成したClient ID/SecretをSupabase Authentication > Providers > Google に設定する。

## 3. X OAuth

X Developer Portal: https://developer.x.com/en/portal/dashboard

1. X Developer PortalでAppを作成する。
2. OAuth 2.0を有効化する。
3. Callback URLにSupabaseのCallback URLを設定する。
   - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. Client ID/SecretをSupabase Authentication > Providers > X に設定する。

## 4. Stripe

Dashboard: https://dashboard.stripe.com/

1. ProductsでLight / Standard / Premiumの月額Priceを作る。
   - https://dashboard.stripe.com/test/products
2. Price IDを環境変数に入れる。
   - `STRIPE_PRICE_LIGHT`
   - `STRIPE_PRICE_STANDARD`
   - `STRIPE_PRICE_PREMIUM`
3. Secret keyを `STRIPE_SECRET_KEY` に入れる。
4. Webhook endpointを作る。
   - https://dashboard.stripe.com/test/webhooks/create
   - Endpoint URL: `https://YOUR_VERCEL_DOMAIN/api/stripe/webhook`
   - Events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
5. Signing secretを `STRIPE_WEBHOOK_SECRET` に入れる。

Local webhook test:

```bash
stripe listen --forward-to localhost:3010/api/stripe/webhook
```

## 5. OpenAI

API keys: https://platform.openai.com/api-keys

1. API keyを作成する。
2. `OPENAI_API_KEY` に入れる。
3. 必要なら `OPENAI_MODEL` を変更する。既定は `gpt-4o-mini`。

## 6. Email notification

Resend: https://resend.com/

1. API keyを作成する。
   - https://resend.com/api-keys
2. 送信ドメインを設定する。
   - https://resend.com/domains
3. 環境変数に入れる。
   - `RESEND_API_KEY`
   - `NOTIFICATION_FROM_EMAIL`

Webhook通知だけで試す場合は `NOTIFICATION_WEBHOOK_URL` でもよい。

## 7. Vercel

Dashboard: https://vercel.com/dashboard

1. Project Settings > Environment Variables に `.env.example` の値を入れる。
2. `NEXT_PUBLIC_SITE_URL` は本番URLにする。
   - `https://YOUR_VERCEL_DOMAIN`
3. Basic認証を有効にする場合:
   - `BASIC_AUTH_USER`
   - `BASIC_AUTH_PASSWORD`
4. Cron保護用に `CRON_SECRET` を設定する。
5. 5分おきBBS巡回は外部Cronで `/api/cron/crawl` を叩く。
6. 1日1回の品質監査は `vercel.json` で毎朝6:30（JST）に設定済み。Vercel本番デプロイ後にCron一覧へ表示されることを確認する。
7. 解析急減や品質異常をSlack/Discordへ送る場合は `OPERATION_ALERT_WEBHOOK_URL` を設定する。

Vercel Hobbyでは高頻度Cronが制限されるため、5分おき運用は外部Cron推奨。Vercel Cronで運用したい場合はPro以上にしてから `vercel.json` にCron設定を追加する。

External cron alternative:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR_VERCEL_DOMAIN/api/cron/crawl

# 1日1回。異常がなければ200、対応が必要な異常があれば502。
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR_VERCEL_DOMAIN/api/cron/audit
```

External cron services:

- https://cron-job.org/
- https://crontap.com/
- https://upstash.com/docs/qstash

## 8. BBS/event source data

1. 店舗、イベント、BBS URLは運営側で用意する。
2. 一般ユーザーは店舗やBBS URLを登録しない。
3. 店舗ごとの公開BBS URLを用意する。
4. 必要なら許可ホストを `SCRAPE_ALLOWED_HOSTS` にカンマ区切りで入れる。
5. 本番環境でPlaywrightが動かない場合:
   - `DISABLE_BROWSER_SCREENSHOTS=true`
   - テキスト取得とレーダー算出は継続する。
6. イベントカレンダーに載せたい店舗イベントは、SQL/seed/管理者用CSVで登録する。

## 9. Local verification after setup

1. `.env.local` を作成する。
2. 依存関係を入れる。

```bash
npm install
```

3. ローカル起動。

```bash
npm run dev
```

4. 開く。
   - http://localhost:3010
5. 画面右上が `DB保存中` になることを確認する。
6. ログイン画面でGoogle/X/メール認証を確認する。
7. SQL Editorで `supabase/seed-store-catalog.sql` または `supabase/seed-demo-catalog.sql` を流す。
8. BBSトップでStore radarとWatch wordsが更新されることを確認する。
9. 下層ページを確認する。
   - http://localhost:3010/forecast
   - http://localhost:3010/calendar
   - http://localhost:3010/ai-guide
