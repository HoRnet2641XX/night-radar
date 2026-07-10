import { createClient } from '@supabase/supabase-js'
import {
  buildStoreActivityMetrics,
  filterPostsForStoreBusinessWindows,
  inferStoreBusinessWindows,
  normalizedBbsPostsToPostRecords,
} from '../src/lib/scoring.ts'

const PAGE_SIZE = 1000
const RECENT_HOURS = 48

function createDatabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SupabaseのURLとサービスロールキーが必要です。')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function collectRows(queryFactory) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

function japanDateKey(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function nextMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const next = new Date(Date.UTC(year, month, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

function percent(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0
}

function duplicateCount(rows, keyForRow) {
  const seenRows = new Set()
  const seenKeys = new Set()
  let duplicates = 0
  for (const row of rows) {
    if (seenRows.has(row.id)) continue
    seenRows.add(row.id)
    const key = keyForRow(row)
    if (seenKeys.has(key)) duplicates += 1
    else seenKeys.add(key)
  }
  return duplicates
}

function toStore(row) {
  return {
    id: row.id,
    name: row.name,
    area: row.area || '未設定',
    address: row.address || undefined,
    nearestStation: row.nearest_station || undefined,
    phone: row.phone || undefined,
    officialUrl: row.official_url || undefined,
    mapUrl: row.map_url || undefined,
    priceNote: row.price_note || undefined,
    tags: row.tags ?? [],
    hasDaytime: Boolean(row.has_daytime),
    hasNight: row.has_night !== false,
    openingHourDay: row.opening_hour_day || '13:00',
    openingHourNight: row.opening_hour_night || '19:00',
    prStructure: row.pr_structure || '未分類',
    strongDays: row.strong_days ?? [],
    strongEvents: row.strong_events ?? [],
    weakEvents: row.weak_events ?? [],
    trustSeed: Number(row.trust_seed ?? 60),
  }
}

function toNormalizedPost(row) {
  return {
    id: row.id,
    sourceId: row.source_id || undefined,
    storeId: row.store_id,
    sourceUrl: row.source_url || undefined,
    articleNo: row.article_no || undefined,
    authorName: row.author_name || '記載なし',
    authorGender: row.author_gender || '記載なし',
    postedAt: row.posted_at || undefined,
    observedAt: row.observed_at,
    body: row.body || '',
    bodyHash: row.body_hash || '',
    contentKey: row.content_key || '',
  }
}

async function main() {
  const db = createDatabaseClient()
  const now = new Date()
  const referenceAt = now.toISOString()
  const recentThreshold = new Date(now.getTime() - RECENT_HOURS * 60 * 60 * 1000).toISOString()
  const todayKey = japanDateKey(now)
  const monthKey = todayKey.slice(0, 7)
  const nextMonth = nextMonthKey(monthKey)

  const [storeRows, sourceRows, normalizedRows, snapshotRows, eventRows, crawlRows] = await Promise.all([
    collectRows(() => db.from('stores').select('*').order('created_at', { ascending: true }).order('id', { ascending: true })),
    collectRows(() => db.from('bbs_sources').select('*').eq('active', true).order('created_at', { ascending: true }).order('id', { ascending: true })),
    collectRows(() => db.from('bbs_normalized_posts').select('*').gte('observed_at', recentThreshold).order('observed_at', { ascending: false }).order('id', { ascending: false })),
    collectRows(() => db.from('bbs_snapshots').select('id,source_id,store_id,url,extracted_text,captured_at').gte('captured_at', recentThreshold).order('captured_at', { ascending: false }).order('id', { ascending: false })),
    collectRows(() => db.from('events').select('*').gte('date_label', `${monthKey}-01`).lt('date_label', `${nextMonth}-01`).order('date_label', { ascending: true }).order('id', { ascending: true })),
    collectRows(() => db.from('crawl_runs').select('id,source_id,store_id,status,message,fetched_at').gte('fetched_at', recentThreshold).order('fetched_at', { ascending: false }).order('id', { ascending: false })),
  ])

  const stores = storeRows.map(toStore)
  const storeIds = new Set(stores.map((store) => store.id))
  const normalizedPosts = normalizedRows.map(toNormalizedPost)
  const timestampedNormalizedPosts = normalizedPosts.filter((post) => Boolean(post.postedAt))
  const effectivePosts = normalizedBbsPostsToPostRecords(timestampedNormalizedPosts)
  const latestContextByStore = new Map()
  for (const snapshot of snapshotRows) {
    if (!latestContextByStore.has(snapshot.store_id) && snapshot.extracted_text?.trim()) {
      latestContextByStore.set(snapshot.store_id, {
        id: `audit-context-${snapshot.id}`,
        storeId: snapshot.store_id,
        source: 'scrape',
        sourceUrl: snapshot.url,
        postedAt: snapshot.captured_at,
        body: snapshot.extracted_text,
        keywords: [],
      })
    }
  }
  const contextPosts = [...effectivePosts, ...latestContextByStore.values()]
  const businessPosts = filterPostsForStoreBusinessWindows(effectivePosts, stores, referenceAt, [], contextPosts)
  const latestRunBySource = new Map()
  for (const run of crawlRows) if (!latestRunBySource.has(run.source_id)) latestRunBySource.set(run.source_id, run)

  const storeAudit = stores.map((store) => {
    const metrics = buildStoreActivityMetrics({
      storeId: store.id,
      businessPosts,
      normalizedPosts,
      referenceAt,
    })
    const windows = inferStoreBusinessWindows(
      store,
      referenceAt,
      contextPosts.filter((post) => post.storeId === store.id).map((post) => post.body),
    )
    return {
      id: store.id,
      name: store.name,
      businessPosts: metrics.recentPostCount,
      femalePosts: metrics.femalePostCount,
      recentThreeHours: metrics.recentThreeHourCount,
      authorCoverage: metrics.authorCoverage,
      genderCoverage: metrics.genderCoverage,
      businessWindows: windows.map((window) => `${window.label} ${window.startHour}:${String(window.startMinute).padStart(2, '0')}-${window.endHour}:${String(window.endMinute).padStart(2, '0')} (${window.source})`),
    }
  }).sort(
    (left, right) =>
      right.businessPosts - left.businessPosts ||
      right.recentThreeHours - left.recentThreeHours ||
      right.femalePosts - left.femalePosts,
  )

  const sourceAudit = sourceRows.map((source) => {
    const latestRun = latestRunBySource.get(source.id)
    const fetchedAt = source.last_fetched_at ? new Date(source.last_fetched_at) : null
    const attemptAgeMinutes = fetchedAt && !Number.isNaN(fetchedAt.getTime()) ? Math.max(0, Math.round((now.getTime() - fetchedAt.getTime()) / 60000)) : null
    const latestDataAt = latestContextByStore.get(source.store_id)?.postedAt
    const dataDate = latestDataAt ? new Date(latestDataAt) : null
    const dataAgeMinutes = dataDate && !Number.isNaN(dataDate.getTime()) ? Math.max(0, Math.round((now.getTime() - dataDate.getTime()) / 60000)) : null
    return {
      storeId: source.store_id,
      status: source.last_status || '未設定',
      attemptAgeMinutes,
      dataAgeMinutes,
      latestRunStatus: latestRun?.status || '直近48時間なし',
    }
  })

  const normalizedDuplicateCount = duplicateCount(normalizedRows, (row) => `${row.store_id}:${row.content_key}`)
  const eventDuplicateCount = duplicateCount(eventRows, (row) => [row.store_id, row.date_label, row.starts_at, row.title].join('|'))
  const orphanEventCount = eventRows.filter((row) => !storeIds.has(row.store_id)).length
  const eventSourceMissingCount = eventRows.filter((row) => !row.source_url).length
  const namedPosts = normalizedRows.filter((row) => row.author_name && row.author_name !== '記載なし').length
  const genderedPosts = normalizedRows.filter((row) => row.author_gender && row.author_gender !== '記載なし').length
  const healthySources = sourceAudit.filter((source) => source.status === 'ok').length
  const recentDataSources = sourceAudit.filter((source) => source.dataAgeMinutes !== null && source.dataAgeMinutes <= 180).length

  const issues = []
  if (normalizedDuplicateCount) issues.push(`正規化投稿の重複 ${normalizedDuplicateCount}件`)
  if (normalizedRows.some((row) => !row.body?.trim())) issues.push('本文が空の正規化投稿あり')
  if (eventDuplicateCount) issues.push(`当月イベントの重複 ${eventDuplicateCount}件`)
  if (orphanEventCount) issues.push(`登録店舗に紐付かない当月イベント ${orphanEventCount}件`)
  if (sourceAudit.some((source) => source.status !== 'ok')) issues.push('最終取得状態がok以外の巡回元あり')
  if (sourceAudit.some((source) => source.dataAgeMinutes === null || source.dataAgeMinutes > 180)) issues.push('最新データから3時間超の巡回元あり')

  console.log(JSON.stringify({
    auditedAt: referenceAt,
    window: `直近${RECENT_HOURS}時間`,
    summary: {
      stores: stores.length,
      activeSources: sourceRows.length,
      healthySources,
      recentDataSources,
      normalizedPosts: normalizedRows.length,
      timestampedPosts: timestampedNormalizedPosts.length,
      timestampCoverage: percent(timestampedNormalizedPosts.length, normalizedRows.length),
      businessPosts: businessPosts.length,
      authorCoverage: percent(namedPosts, normalizedRows.length),
      genderCoverage: percent(genderedPosts, normalizedRows.length),
      snapshots: snapshotRows.length,
      currentMonthEvents: eventRows.length,
      todayEvents: eventRows.filter((row) => row.date_label === todayKey).length,
      normalizedDuplicateCount,
      eventDuplicateCount,
      orphanEventCount,
      eventSourceMissingCount,
    },
    metadata: {
      areaMissing: storeRows.filter((row) => !row.area || row.area === '未設定').length,
      addressMissing: storeRows.filter((row) => !row.address).length,
      officialUrlMissing: storeRows.filter((row) => !row.official_url).length,
      mapUrlMissing: storeRows.filter((row) => !row.map_url).length,
      priceMissing: storeRows.filter((row) => !row.price_note).length,
    },
    issues,
    sourceAudit,
    storeAudit,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
