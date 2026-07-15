# Night Radar

Night Radar is a mobile-first Next.js app for BBS-based venue signal analysis.

It now includes:

- Supabase-backed store, event, post, situation, BBS source, BBS snapshot, word bookmark, exact-term, notification, score snapshot, and subscription tables
- operator-managed shared venue catalog
- public discovery pages: `/shops`, `/ranking`, `/areas`, `/features`, `/map`, `/likes`, and `/guides`
- store detail pages with hours, price note, area/address, official URL, BBS URL, map link, and recent signals
- PWA manifest, sitemap, robots, RSS feed, FAQ/schema.org JSON-LD, breadcrumbs, and collection schema
- CSV/SQL-based catalog seeding for stores, events, posts, and BBS sources
- BBS screenshots and cron crawling for operator-managed sources
- vertical store radar, store share donut, watched-word hits, forecast ranking, and monthly event calendar
- saved per-user store decisions for candidate / hidden venues
- exact-match search for popular single male, popular single female, and negative watch terms
- weekday posting ratio, store pulse, and event score calculation
- OpenAI analysis with deterministic heuristic fallback
- notification preferences and dispatch through in-app, Resend email, or webhook
- daily aggregate-only X post preview and scheduled publishing with duplicate protection
- Supabase auth through X OAuth
- Stripe Checkout, webhook subscription sync, and billing portal
- Terms and Privacy pages

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3010`.

To check local setup without exposing secret values:

```bash
npm run check:ready -- --url=http://localhost:3010
```

Without Supabase keys, the app runs in demo mode. With Supabase connected, users can read the shared catalog and save only user-specific settings such as word bookmarks, notification preferences, exact terms, and billing state.

## Configure

Copy `.env.example` to `.env.local` and fill the keys.

For a step-by-step setup checklist with dashboard URLs, see `docs/setup/external-setup-checklist.md`.

### Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. If you already applied an older user-owned schema, run `supabase/migrations/20260611_shared_catalog.sql`.
4. If the project already exists, also run `supabase/migrations/20260629_user_store_decisions.sql` to persist candidate / hidden store decisions.
5. For the initial venue catalog, run `supabase/seed-store-catalog.sql`.
6. For a local/demo catalog instead, run `supabase/seed-demo-catalog.sql`.
7. Enable Auth providers: X / Twitter OAuth 2.0.
8. Add redirect URLs:
   - `http://localhost:3010/api/auth/callback`
   - `https://YOUR_DOMAIN/api/auth/callback`
9. Set:
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

Set `CRON_SECRET` to protect `/api/cron/crawl`. In production, the cron route refuses to run without this secret.

BBS sources accept a 5-minute minimum crawl interval. The app route honors that interval, but your scheduler must call `/api/cron/crawl` every 5 minutes for true 5-minute operation. Vercel Hobby plans reject high-frequency cron schedules, so this project uses an external cron service by default. Use Vercel Pro if you want to re-add Vercel Cron. If the runtime cannot launch Playwright, set `DISABLE_BROWSER_SCREENSHOTS=true`; radar metrics still save from text snapshots.

Vercel Cron calls `/api/cron/audit` once a day at 06:30 JST. It uses the same `CRON_SECRET` automatically and checks stale or failed sources, malformed/spam/duplicate posts, timestamp parsing, event consistency, and location guidance. Expected unknowns such as unverified events or unreported gender remain warnings; the route returns `502` only for actionable failures.

Catalog writes are operator-only. Logged-in users can read stores, events, posts, BBS sources, crawl runs, and snapshots, but cannot write or delete them through the app. Use SQL, seed files, or a future admin-only dashboard for catalog updates.

### Notifications

Set `RESEND_API_KEY` for email delivery or `NOTIFICATION_WEBHOOK_URL` for user webhook delivery. Set `OPERATION_ALERT_WEBHOOK_URL` to a Slack Incoming Webhook, Discord Webhook, or a JSON webhook for operator alerts. Without an operator webhook, the crawl and audit routes still return `502`, so the external cron service can send its own failure email.

Users can save notification preferences in the app. A saved user webhook URL is used before the global `NOTIFICATION_WEBHOOK_URL`.

Cron crawls send one operator alert and also create notification jobs for configured users when a BBS source returns `blocked` or `failed`, including parser-count drops.

### X automatic posting

X posting runs three times a day. The Vercel Hobby scheduler can run up to 59 minutes after the configured minute, so each daily job starts at the beginning of the hour before its deadline:

- `/api/cron/x-post/midday`: 12:00-12:59 JST, today's visit-intent post ranking
- `/api/cron/x-post/evening`: 18:00-18:59 JST, stores growing against the same period last week
- `/api/cron/x-post/tomorrow`: 23:00-23:59 JST, tomorrow's official events and BBS visit intent

Each route publishes only when all of the following are true:

- `X_AUTO_POST_ENABLED=true`
- all four OAuth 1.0a credentials are configured
- `supabase/migrations/20260715_x_auto_posts.sql` and `20260716_expand_x_auto_post_kinds.sql` have been applied
- at least three stores have fresh, successful data above the configured confidence threshold

The post contains store-level aggregates only. BBS author names and post bodies are never sent to X. A unique key per date and posting slot in `x_auto_posts` prevents duplicate posts. The three relative labels used in X and the app are `🔥 アツすぎて滅`, `🚀 テンアゲ`, and `👀 じわアツ`.

Preview the exact text without publishing:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://YOUR_VERCEL_DOMAIN/api/cron/x-post/midday?dryRun=1"

curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://YOUR_VERCEL_DOMAIN/api/cron/x-post/evening?dryRun=1"

curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://YOUR_VERCEL_DOMAIN/api/cron/x-post/tomorrow?dryRun=1"
```

Required environment variables:

- `X_API_KEY` (Consumer Key)
- `X_API_SECRET` (Consumer Secret)
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`
- `X_AUTO_POST_ENABLED` (`false` until the preview is approved)

Set `X_AUTO_POST_INCLUDE_URL=false` if the post should not include the app link. X API posting is usage-priced, and posts containing a URL may use a different price tier; verify the current amount in the X Developer Console before enabling production posting.

### Plan limits

Persistent database operations apply plan limits after Supabase is connected:

- Free: 30 CSV rows, 1 BBS source, 1 exact-match term per group, 2 notification jobs
- Light: 200 CSV rows, 5 BBS sources, 3 exact-match terms per group, 5 notification jobs
- Standard: 1000 CSV rows, 20 BBS sources, 10 exact-match terms per group, 12 notification jobs
- Premium: 5000 CSV rows, 60 BBS sources, 30 exact-match terms per group, 30 notification jobs

## CSV columns

- Stores: `id,name,area,address,nearestStation,officialUrl,mapUrl,priceNote,tags,hasDaytime,hasNight,openingHourDay,openingHourNight,prStructure,strongDays,strongEvents,weakEvents,trustSeed`
- Events: `id,storeId,date,weekday,startsAt,session,category,title,sourceUrl`
- Posts: `id,storeId,source,sourceUrl,postedAt,body,keywords`

IDs can be omitted in app forms and CSV files. When CSV IDs are omitted, the importer generates stable IDs from row content. Japanese headers such as `店舗名`, `エリア`, `本文`, `キーワード`, and `店舗ID` are also accepted.

## Safety boundary

The app works at venue and event aggregate level. It does not support personal tracking, individual arrival guarantees, non-public data collection, or content that encourages illegal or disruptive behavior.
