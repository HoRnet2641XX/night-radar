import { collectPagedRows } from '@/lib/pagination'
import { officialEventCoverageForMonth } from '@/lib/official-event-coverage'
import { getCronAuthorizationError } from '@/lib/server/cron-auth'
import { auditDataQuality, nextMonthKey } from '@/lib/server/data-quality-audit'
import { dispatchOperationalAlert } from '@/lib/server/notifications'
import { runNightRadarMaintenance } from '@/lib/server/maintenance'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

type Row = Record<string, unknown>

function japanDateKey(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export async function GET(request: Request) {
  const authorizationError = getCronAuthorizationError(request, 'データ品質監査')
  if (authorizationError) {
    return Response.json(
      { error: authorizationError },
      { status: authorizationError.includes('CRON_SECRET') ? 503 : 401 },
    )
  }

  const supabase = createSupabaseAdminClient()
  if (!supabase) return Response.json({ error: 'Supabaseの管理接続が未設定です。' }, { status: 503 })

  const now = new Date()
  const month = japanDateKey(now).slice(0, 7)
  const observedAfter = new Date(now.getTime() - 48 * 60 * 60 * 1_000).toISOString()
  const nextMonth = nextMonthKey(month)

  const [storesResult, sourcesResult, postsResult, eventsResult] = await Promise.all([
    collectPagedRows<Row, { message: string }>((from, to) =>
      supabase.from('stores').select('id,address,nearest_station').range(from, to),
    ),
    collectPagedRows<Row, { message: string }>((from, to) =>
      supabase
        .from('bbs_sources')
        .select('id,store_id,label,last_status,last_message,last_fetched_at')
        .eq('active', true)
        .range(from, to),
    ),
    collectPagedRows<Row, { message: string }>((from, to) =>
      supabase
        .from('bbs_normalized_posts')
        .select('id,source_id,store_id,source_url,article_no,author_name,author_gender,posted_at,observed_at,body,body_hash,content_key')
        .gte('observed_at', observedAfter)
        .range(from, to),
    ),
    collectPagedRows<Row, { message: string }>((from, to) =>
      supabase
        .from('events')
        .select('id,store_id,date_label,title,source_url')
        .gte('date_label', `${month}-01`)
        .lt('date_label', `${nextMonth}-01`)
        .range(from, to),
    ),
  ])

  const queryError = storesResult.error || sourcesResult.error || postsResult.error || eventsResult.error
  if (queryError) return Response.json({ error: queryError.message }, { status: 500 })

  const audit = auditDataQuality({
    stores: (storesResult.data ?? []) as Parameters<typeof auditDataQuality>[0]['stores'],
    sources: (sourcesResult.data ?? []) as Parameters<typeof auditDataQuality>[0]['sources'],
    posts: (postsResult.data ?? []) as Parameters<typeof auditDataQuality>[0]['posts'],
    events: (eventsResult.data ?? []) as Parameters<typeof auditDataQuality>[0]['events'],
    eventCoverage: officialEventCoverageForMonth(month),
    referenceAt: now.toISOString(),
    staleMinutes: Number(process.env.DATA_QUALITY_SOURCE_STALE_MINUTES) || 15,
    minimumTimestampCoverage: Number(process.env.DATA_QUALITY_MIN_TIMESTAMP_COVERAGE) || 90,
  })

  const maintenance = await runNightRadarMaintenance()
  if (maintenance.status === 'failed') {
    audit.failures.push(`履歴データの保持処理に失敗: ${maintenance.message ?? '詳細なし'}`)
    audit.healthy = false
  }
  let notification = 'not_needed'
  if (!audit.healthy && process.env.DATA_QUALITY_ALERTS !== '0') {
    const result = await dispatchOperationalAlert({
      title: `日次データ品質監査で${audit.failures.length}件の異常を検知`,
      body: audit.failures.join('\n'),
      severity: 'error',
      details: {
        auditedAt: audit.auditedAt,
        warnings: audit.warnings.join(' / ') || 'なし',
      },
    })
    notification = result.status
  }

  return Response.json({ ...audit, maintenance, notification }, { status: audit.healthy ? 200 : 502 })
}
