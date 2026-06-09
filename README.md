# Night Radar

Night Radar is a mobile-first Next.js app for BBS-based venue signal analysis.

It now includes:

- Supabase-backed store, event, post, situation, BBS source, BBS snapshot, word bookmark, exact-term, notification, score snapshot, and subscription tables
- manual data input with persistence
- CSV import with Japanese headers and generated IDs when IDs are omitted
- BBS source registration, source deletion, plan limits, screenshots, and manual/cron crawling
- vertical store radar, store share donut, watched-word hits, forecast ranking, and monthly event calendar
- exact-match search for popular single male, popular single female, and negative watch terms
- weekday posting ratio, store pulse, and event score calculation
- OpenAI analysis with deterministic heuristic fallback
- notification preferences and dispatch through in-app, Resend email, or webhook
- Supabase auth through Google, X, and email OTP
- Stripe Checkout, webhook subscription sync, and billing portal
- Basic Auth gate for private deployments
- Terms and Privacy pages

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Without Supabase keys, the app runs in demo mode. UI actions still work in the current browser session, but they are not durable.

## Configure

Copy `.env.example` to `.env.local` and fill the keys.

For a step-by-step setup checklist with dashboard URLs, see `docs/setup/external-setup-checklist.md`.

### Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Enable Auth providers: Email OTP, Google, and X / Twitter OAuth 2.0.
4. Add redirect URLs:
   - `http://localhost:3000/api/auth/callback`
   - `https://YOUR_DOMAIN/api/auth/callback`
5. Set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### Stripe

1. Create recurring prices for Light, Standard, and Premium.
2. Set:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_LIGHT`
   - `STRIPE_PRICE_STANDARD`
   - `STRIPE_PRICE_PREMIUM`
3. Point the webhook to `/api/stripe/webhook`.
4. Listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

### AI

Set `OPENAI_API_KEY`. If it is missing or the request fails, the app uses deterministic heuristic analysis.

### Scraping

Set `SCRAPE_ALLOWED_HOSTS` if you want an allowlist. Empty means any public `http` or `https` host except local/private IPs.

Set `CRON_SECRET` to protect `/api/cron/crawl`. Vercel Cron is configured in `vercel.json` to call the route every 5 minutes.

BBS sources accept a 5-minute minimum crawl interval. The app route honors that interval, but your scheduler must call `/api/cron/crawl` every 5 minutes for true 5-minute operation. Vercel Hobby plans may reject high-frequency cron schedules; use Vercel Pro or an external cron service for 5-minute crawling. If the runtime cannot launch Playwright, set `DISABLE_BROWSER_SCREENSHOTS=true`; radar metrics still save from text snapshots.

### Notifications

Set `RESEND_API_KEY` for email delivery or `NOTIFICATION_WEBHOOK_URL` for webhook delivery. Without either, email/webhook jobs are marked `dry_run`; in-app jobs are marked `sent`.

Users can save notification preferences in the app. A saved user webhook URL is used before the global `NOTIFICATION_WEBHOOK_URL`.

### Plan limits

Persistent database operations apply plan limits after Supabase is connected:

- Free: 30 CSV rows, 1 BBS source, 1 exact-match term per group, 2 notification jobs
- Light: 200 CSV rows, 5 BBS sources, 3 exact-match terms per group, 5 notification jobs
- Standard: 1000 CSV rows, 20 BBS sources, 10 exact-match terms per group, 12 notification jobs
- Premium: 5000 CSV rows, 60 BBS sources, 30 exact-match terms per group, 30 notification jobs

### Basic Auth

Set `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` in Vercel to protect the whole app before Supabase login.

## CSV columns

- Stores: `id,name,area,hasDaytime,hasNight,openingHourDay,openingHourNight,prStructure,strongDays,strongEvents,weakEvents,trustSeed`
- Events: `id,storeId,date,weekday,startsAt,session,category,title,sourceUrl`
- Posts: `id,storeId,source,sourceUrl,postedAt,body,keywords`

IDs can be omitted in app forms and CSV files. When CSV IDs are omitted, the importer generates stable IDs from row content. Japanese headers such as `店舗名`, `エリア`, `本文`, `キーワード`, and `店舗ID` are also accepted.

## Safety boundary

The app works at venue and event aggregate level. It does not support personal tracking, individual arrival guarantees, non-public data collection, or content that encourages illegal or disruptive behavior.
