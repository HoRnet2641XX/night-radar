import { buildFemaleRetentionDataset, femaleRetentionWindow } from '@/lib/female-retention'
import { collectPagedRows } from '@/lib/pagination'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { BbsNormalizedPost } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 15

type Row = Record<string, unknown>

const normalizedPostColumns =
  'id,source_id,store_id,source_url,article_no,author_name,author_gender,posted_at,observed_at,body,body_hash,content_key'

function stringField(row: Row, key: string, fallback = '') {
  const value = row[key]
  return typeof value === 'string' ? value : fallback
}

function optionalStringField(row: Row, key: string) {
  const value = row[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function toNormalizedPost(row: Row): BbsNormalizedPost {
  return {
    id: stringField(row, 'id'),
    sourceId: optionalStringField(row, 'source_id'),
    storeId: stringField(row, 'store_id'),
    sourceUrl: optionalStringField(row, 'source_url'),
    articleNo: optionalStringField(row, 'article_no'),
    authorName: stringField(row, 'author_name', '記載なし'),
    authorGender: stringField(row, 'author_gender', '記載なし'),
    postedAt: optionalStringField(row, 'posted_at'),
    observedAt: stringField(row, 'observed_at'),
    body: stringField(row, 'body'),
    bodyHash: stringField(row, 'body_hash'),
    contentKey: stringField(row, 'content_key'),
  }
}

export async function GET(request: Request) {
  const storeId = new URL(request.url).searchParams.get('storeId')?.trim() ?? ''
  if (!storeId || storeId.length > 100) {
    return Response.json({ error: '店舗を選択してください。' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  if (!supabase) return Response.json({ error: '店舗データへ接続できません。' }, { status: 503 })

  const referenceAt = new Date()
  const window = femaleRetentionWindow(referenceAt)
  const futureTolerance = new Date(referenceAt.getTime() + 10 * 60 * 1_000).toISOString()
  const [storeResult, postsResult] = await Promise.all([
    supabase.from('stores').select('id').eq('id', storeId).maybeSingle(),
    collectPagedRows<Row, { message: string }>((from, to) =>
      supabase
        .from('bbs_normalized_posts')
        .select(normalizedPostColumns)
        .eq('store_id', storeId)
        .gte('posted_at', window.postedAfter)
        .lte('posted_at', futureTolerance)
        .order('posted_at', { ascending: true })
        .range(from, to),
    ),
  ])

  if (storeResult.error) return Response.json({ error: storeResult.error.message }, { status: 500 })
  if (!storeResult.data) return Response.json({ error: '店舗が見つかりません。' }, { status: 404 })
  if (postsResult.error) return Response.json({ error: postsResult.error.message }, { status: 500 })

  const dataset = buildFemaleRetentionDataset({
    posts: (postsResult.data ?? []).map(toNormalizedPost),
    referenceAt,
    windowWeeks: window.windowWeeks,
  })

  return Response.json(
    { storeId, ...dataset },
    { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } },
  )
}
