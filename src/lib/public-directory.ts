import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { buildDailyStoreDataset } from './daily-store-insights'
import { events as demoEvents, posts as demoPosts, stores as demoStores } from './demo-data'
import { formatBarName, formatStoreArea, formatStoreSessionLabel } from './display'
import { mergeOfficialEvents } from './official-events'
import { collectPagedRows } from './pagination'
import { PUBLIC_DIRECTORY_CACHE_TAG } from './public-directory-cache'
import { isStructurallyValidCustomerNormalizedPost } from './scoring'
import { resolvedStoreArea, resolvedStoreMapUrl, resolvedStoreOfficialUrl } from './store-catalog'
import { matchesStoreSearch } from './store-search'
import { createSupabaseAdminClient } from './supabase/server'
import type {
  BbsNormalizedPost,
  BbsSnapshot,
  BbsSnapshotMetrics,
  BbsSource,
  EventInput,
  PostRecord,
  StoreDailyInsight,
  StoreProfile,
  StoreRadarPoint,
} from './types'

type DbRow = Record<string, unknown>
type DbListResult = { data: DbRow[] | null; error: { code?: string; message?: string } | null }

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://night-radar.vercel.app'
const recentPostWindowHours = 48

const storeSelectColumns =
  'id,name,area,address,nearest_station,phone,official_url,map_url,price_note,tags,has_daytime,has_night,opening_hour_day,opening_hour_night,pr_structure,strong_days,strong_events,weak_events,trust_seed,created_at'
const legacyStoreSelectColumns =
  'id,name,area,has_daytime,has_night,opening_hour_day,opening_hour_night,pr_structure,strong_days,strong_events,weak_events,trust_seed,created_at'
const eventSelectColumns = 'id,store_id,date_label,weekday,starts_at,session,category,title,details,source_url,created_at'
const postSelectColumns = 'id,store_id,source,source_url,posted_at,body,keywords,created_at'
const sourceSelectColumns =
  'id,store_id,label,url,parser_type,active,crawl_interval_minutes,last_fetched_at,last_status,last_message,created_at'
const snapshotLightSelectColumns = 'id,source_id,store_id,url,metrics,radar_score,captured_at'
const snapshotContextSelectColumns = 'id,store_id,url,extracted_text,captured_at'
const normalizedPostSelectColumns =
  'id,source_id,store_id,source_url,article_no,author_name,author_gender,posted_at,observed_at,body,body_hash,content_key'

function isoHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function isMissingRelationError(error?: { code?: string; message?: string } | null) {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist|Could not find the table/i.test(error.message ?? '')
  )
}

function isMissingColumnError(error?: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '')
}

const areaSlugMap: Record<string, string> = {
  tokyo: '東京全域',
  shinjuku: '新宿',
  ikebukuro: '池袋',
  shibuya: '渋谷',
  ueno: '上野',
  gotanda: '五反田',
  roppongi: '六本木',
  kinshicho: '錦糸町',
  akihabara: '秋葉原',
  ogikubo: '荻窪',
  tama: '聖蹟桜ヶ丘',
  all: 'すべて',
}

const tokyoAreaFragments = ['新宿', '池袋', '渋谷', '上野', '御徒町', '五反田', '六本木', '西麻布', '錦糸町', '秋葉原', '荻窪', '聖蹟桜ヶ丘']

const conditionLabels = {
  hot: 'いま動きあり',
  open: '営業中',
  events: 'イベントあり',
  female: '女性率高め',
  fresh: '更新が新しい',
  price: '料金確認済み',
  beginner: '初回向け',
  day: '昼営業',
  night: '夜営業',
} as const

export type RankingKind = 'today' | 'weekend' | 'female' | 'events' | 'open'
export type ConditionKey = keyof typeof conditionLabels

export type PublicStoreSummary = {
  insight: StoreDailyInsight
  store: StoreProfile
  point: StoreRadarPoint
  source?: BbsSource
  nextEvent?: EventInput
  areaLabel: string
  stationLabel: string
  addressLabel: string
  officialUrl?: string
  bbsUrl?: string
  mapUrl: string
  priceLabel: string
  sessionLabel: string
  womenRatio: number | null
  femalePostCount: number
  recentPostCount: number
  recentThreeHourCount: number
  todayEventCount: number
  upcomingEventCount: number
  weekendEventCount: number
  lastUpdatedAt?: string
  lastUpdatedLabel: string
  isOpenNow: boolean
  temperatureLabel: string
  primaryReason: string
  dataConfidence: number
  dataConfidenceLabel: string
  businessWindowLabel: string
  reliabilityLabel: string
  excludedUntimestampedCount: number
}

export type PublicDirectoryState = {
  stores: StoreProfile[]
  events: EventInput[]
  sources: BbsSource[]
  summaries: PublicStoreSummary[]
  generatedAt: string
}

export type PublicStoreDetail = {
  summary: PublicStoreSummary
  events: EventInput[]
  recentPosts: BbsNormalizedPost[]
}

export const publicAreas = Object.entries(areaSlugMap).map(([slug, label]) => ({ slug, label }))
export const publicConditions = Object.entries(conditionLabels)
  .filter(([key]) => key !== 'price')
  .map(([key, label]) => ({ key: key as ConditionKey, label }))
export const publicRankingKinds: Array<{ key: RankingKind; label: string; description: string }> = [
  { key: 'today', label: '今日', description: '今日の来店判断に含めた顧客投稿の総数が多い順に並べます。' },
  { key: 'weekend', label: '週末', description: '週末イベントを優先しつつ、当日の顧客投稿が多い店舗を上にします。' },
  { key: 'female', label: '女性書込', description: '直近の性別表記から女性の書き込みが多い順に見ます。' },
  { key: 'events', label: 'イベントあり', description: '本日または直近イベントがある店舗の中で、当日の顧客投稿が多い順に見ます。' },
  { key: 'open', label: '営業中', description: '営業時間が判定できる店舗の中で、当日の顧客投稿が多い順に見ます。' },
]

function stringField(row: DbRow, key: string, fallback = '') {
  const value = row[key]
  return typeof value === 'string' ? value : value == null ? fallback : String(value)
}

function optionalStringField(row: DbRow, key: string) {
  const value = stringField(row, key)
  return value || undefined
}

function numberField(row: DbRow, key: string, fallback = 0) {
  const value = row[key]
  return typeof value === 'number' ? value : Number(value ?? fallback)
}

function booleanField(row: DbRow, key: string, fallback = false) {
  const value = row[key]
  return typeof value === 'boolean' ? value : value == null ? fallback : value === 'true'
}

function stringArrayField(row: DbRow, key: string) {
  const value = row[key]
  return Array.isArray(value) ? value.map(String) : []
}

function toStore(row: DbRow): StoreProfile {
  const id = stringField(row, 'id')
  return {
    id,
    name: stringField(row, 'name'),
    area: resolvedStoreArea(id, stringField(row, 'area', '未設定')),
    address: optionalStringField(row, 'address'),
    nearestStation: optionalStringField(row, 'nearest_station'),
    phone: optionalStringField(row, 'phone'),
    officialUrl: optionalStringField(row, 'official_url'),
    mapUrl: optionalStringField(row, 'map_url'),
    priceNote: optionalStringField(row, 'price_note'),
    tags: stringArrayField(row, 'tags'),
    hasDaytime: booleanField(row, 'has_daytime'),
    hasNight: booleanField(row, 'has_night', true),
    openingHourDay: stringField(row, 'opening_hour_day', '13:00'),
    openingHourNight: stringField(row, 'opening_hour_night', '19:00'),
    prStructure: stringField(row, 'pr_structure', '未分類'),
    strongDays: stringArrayField(row, 'strong_days'),
    strongEvents: stringArrayField(row, 'strong_events'),
    weakEvents: stringArrayField(row, 'weak_events'),
    trustSeed: numberField(row, 'trust_seed', 60),
  }
}

function toEvent(row: DbRow): EventInput {
  return {
    id: stringField(row, 'id'),
    storeId: stringField(row, 'store_id'),
    date: stringField(row, 'date_label', '今日'),
    weekday: stringField(row, 'weekday', '未設定'),
    startsAt: stringField(row, 'starts_at', '19:00'),
    session: stringField(row, 'session') === 'day' ? 'day' : 'night',
    category: stringField(row, 'category', '未分類'),
    title: stringField(row, 'title'),
    details: optionalStringField(row, 'details'),
    sourceUrl: optionalStringField(row, 'source_url'),
  }
}

function toPost(row: DbRow): PostRecord {
  return {
    id: stringField(row, 'id'),
    storeId: stringField(row, 'store_id'),
    source: stringField(row, 'source') as PostRecord['source'],
    sourceUrl: optionalStringField(row, 'source_url'),
    postedAt: stringField(row, 'posted_at'),
    body: stringField(row, 'body'),
    keywords: stringArrayField(row, 'keywords'),
  }
}

function toBbsSource(row: DbRow): BbsSource {
  return {
    id: stringField(row, 'id'),
    storeId: stringField(row, 'store_id'),
    label: stringField(row, 'label', 'BBS'),
    url: stringField(row, 'url'),
    parserType: stringField(row, 'parser_type') === 'body' ? 'body' : 'auto',
    active: booleanField(row, 'active', true),
    crawlIntervalMinutes: numberField(row, 'crawl_interval_minutes', 360),
    lastFetchedAt: optionalStringField(row, 'last_fetched_at'),
    lastStatus: stringField(row, 'last_status', 'pending') as BbsSource['lastStatus'],
    lastMessage: optionalStringField(row, 'last_message'),
  }
}

function toBbsSnapshot(row: DbRow): BbsSnapshot {
  const metrics = row.metrics && typeof row.metrics === 'object' ? (row.metrics as Partial<BbsSnapshotMetrics>) : {}
  return {
    id: stringField(row, 'id'),
    sourceId: optionalStringField(row, 'source_id'),
    storeId: stringField(row, 'store_id'),
    url: stringField(row, 'url'),
    screenshotDataUrl: optionalStringField(row, 'screenshot_data_url'),
    extractedText: stringField(row, 'extracted_text'),
    metrics: {
      femaleOnly: Number(metrics.femaleOnly ?? 0),
      firstVisit: Number(metrics.firstVisit ?? 0),
      comeback: Number(metrics.comeback ?? 0),
      groupVisit: Number(metrics.groupVisit ?? 0),
      emoji: Number(metrics.emoji ?? 0),
      totalSignals: Number(metrics.totalSignals ?? 0),
      textLength: Number(metrics.textLength ?? 0),
    },
    radarScore: numberField(row, 'radar_score'),
    capturedAt: stringField(row, 'captured_at'),
  }
}

function toBbsNormalizedPost(row: DbRow): BbsNormalizedPost {
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

function toBusinessContextPost(row: DbRow): PostRecord {
  return {
    id: `public-context-${stringField(row, 'id')}`,
    storeId: stringField(row, 'store_id'),
    source: 'scrape',
    sourceUrl: optionalStringField(row, 'url'),
    postedAt: stringField(row, 'captured_at'),
    body: stringField(row, 'extracted_text'),
    keywords: [],
  }
}

function demoPublicState(): PublicDirectoryState {
  return buildPublicState({
    stores: demoStores,
    events: demoEvents,
    rawPosts: demoPosts,
    sources: [],
    snapshots: [],
    normalizedPosts: [],
    businessContextPosts: [],
  })
}

async function loadPublicDirectoryState(): Promise<PublicDirectoryState> {
  const supabase = createSupabaseAdminClient()
  if (!supabase) return demoPublicState()

  let storeResult = (await supabase.from('stores').select(storeSelectColumns).order('name', { ascending: true })) as DbListResult
  if (isMissingColumnError(storeResult.error)) {
    storeResult = (await supabase.from('stores').select(legacyStoreSelectColumns).order('name', { ascending: true })) as DbListResult
  }
  if (storeResult.error) return demoPublicState()

  const storeIds = (storeResult.data ?? []).map((row) => String(row.id)).filter(Boolean)
  const recentPostThreshold = isoHoursAgo(recentPostWindowHours)
  const [eventResult, postResult, sourceResult, snapshotResult, snapshotContextResult, normalizedPostResult] = await Promise.all([
    storeIds.length
      ? supabase
          .from('events')
          .select(eventSelectColumns)
          .in('store_id', storeIds)
          .order('created_at', { ascending: false })
          .limit(1500)
      : Promise.resolve({ data: [], error: null }),
    storeIds.length
      ? supabase
          .from('posts')
          .select(postSelectColumns)
          .in('store_id', storeIds)
          .order('posted_at', { ascending: false })
          .limit(1200)
      : Promise.resolve({ data: [], error: null }),
    storeIds.length
      ? supabase.from('bbs_sources').select(sourceSelectColumns).in('store_id', storeIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    storeIds.length
      ? supabase
          .from('bbs_snapshots')
          .select(snapshotLightSelectColumns)
          .in('store_id', storeIds)
          .order('captured_at', { ascending: false })
          .limit(320)
      : Promise.resolve({ data: [], error: null }),
    storeIds.length
      ? supabase
          .from('bbs_snapshots')
          .select(snapshotContextSelectColumns)
          .in('store_id', storeIds)
          .neq('extracted_text', '')
          .order('captured_at', { ascending: false })
          .limit(120)
      : Promise.resolve({ data: [], error: null }),
    storeIds.length
      ? collectPagedRows<DbRow, NonNullable<DbListResult['error']>>(async (from, to) =>
          (await supabase
            .from('bbs_normalized_posts')
            .select(normalizedPostSelectColumns)
            .in('store_id', storeIds)
            .gte('observed_at', recentPostThreshold)
            .order('observed_at', { ascending: false })
            .range(from, to)) as DbListResult,
        )
      : Promise.resolve({ data: [], error: null }),
  ])

  const normalizedPostError =
    normalizedPostResult.error && !isMissingRelationError(normalizedPostResult.error) ? normalizedPostResult.error : null

  if (eventResult.error || postResult.error || sourceResult.error || snapshotResult.error || snapshotContextResult.error || normalizedPostError) {
    return demoPublicState()
  }

  const seenContextStores = new Set<string>()
  const businessContextPosts = (snapshotContextResult.data ?? [])
    .map(toBusinessContextPost)
    .filter((post) => {
      if (!post.body.trim() || seenContextStores.has(post.storeId)) return false
      seenContextStores.add(post.storeId)
      return true
    })

  return buildPublicState({
    stores: (storeResult.data ?? []).map(toStore),
    events: mergeOfficialEvents((eventResult.data ?? []).map(toEvent)),
    rawPosts: (postResult.data ?? []).map(toPost),
    sources: (sourceResult.data ?? []).map(toBbsSource),
    snapshots: (snapshotResult.data ?? []).map(toBbsSnapshot),
    normalizedPosts: normalizedPostResult.error ? [] : (normalizedPostResult.data ?? []).map(toBbsNormalizedPost),
    businessContextPosts,
  })
}

const loadCachedPublicDirectoryState = unstable_cache(loadPublicDirectoryState, ['public-directory-state-compact-2026-07-11'], {
  revalidate: 60,
  tags: [PUBLIC_DIRECTORY_CACHE_TAG],
})

export const getPublicDirectoryState = cache(loadCachedPublicDirectoryState)

async function loadPublicStoreDetail(storeId: string): Promise<PublicStoreDetail | null> {
  const state = await getPublicDirectoryState()
  const summary = state.summaries.find((item) => item.store.id === storeId)
  if (!summary) return null

  const events = state.events.filter((event) => event.storeId === storeId)
  const supabase = createSupabaseAdminClient()
  if (!supabase) return { summary, events, recentPosts: [] }

  const result = await collectPagedRows<DbRow, NonNullable<DbListResult['error']>>(async (from, to) =>
    (await supabase
      .from('bbs_normalized_posts')
      .select(normalizedPostSelectColumns)
      .eq('store_id', storeId)
      .gte('observed_at', isoHoursAgo(recentPostWindowHours))
      .order('posted_at', { ascending: false })
      .range(from, to)) as DbListResult,
  )
  if (result.error && !isMissingRelationError(result.error)) return { summary, events, recentPosts: [] }

  const seen = new Set<string>()
  const rankingPostIds = new Set(summary.insight.rankingPostIds)
  const recentPosts = (result.data ?? [])
    .map(toBbsNormalizedPost)
    .filter(isStructurallyValidCustomerNormalizedPost)
    .filter((post) => rankingPostIds.has(`normalized-${post.id}`))
    .filter((post) => {
      const key = post.contentKey || post.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .toSorted((left, right) => new Date(right.postedAt ?? 0).getTime() - new Date(left.postedAt ?? 0).getTime())

  return { summary, events, recentPosts }
}

export const getPublicStoreDetail = cache(loadPublicStoreDetail)

function buildPublicState(input: {
  stores: StoreProfile[]
  events: EventInput[]
  rawPosts: PostRecord[]
  sources: BbsSource[]
  snapshots: BbsSnapshot[]
  normalizedPosts: BbsNormalizedPost[]
  businessContextPosts: PostRecord[]
}): PublicDirectoryState {
  const generatedAt = new Date().toISOString()
  const dailyDataset = buildDailyStoreDataset({
    stores: input.stores,
    events: input.events,
    rawPosts: input.rawPosts,
    sources: input.sources,
    snapshots: input.snapshots,
    normalizedPosts: input.normalizedPosts,
    businessContextPosts: input.businessContextPosts,
    referenceAt: generatedAt,
  })
  const summaries = dailyDataset.insights.map((insight) =>
    buildPublicStoreSummary({
      insight,
      events: input.events.filter((event) => event.storeId === insight.store.id),
      posts: dailyDataset.businessPosts.filter((post) => post.storeId === insight.store.id),
    }),
  )

  return {
    stores: input.stores,
    events: input.events,
    sources: input.sources,
    summaries,
    generatedAt,
  }
}

function buildPublicStoreSummary(input: {
  insight: StoreDailyInsight
  events: EventInput[]
  posts: PostRecord[]
}): PublicStoreSummary {
  const { insight } = input
  const { point, source, generatedAt } = insight
  const areaLabel = inferStoreArea(point.store)
  const bbsUrl = source?.url
  const officialUrl = resolvedStoreOfficialUrl(point.store, bbsUrl)
  const lastUpdatedAt = latestDate(
    [
      insight.lastSuccessfulAt,
      insight.lastAttemptAt,
      ...input.posts.map((post) => post.postedAt),
    ],
    generatedAt,
  )
  const recentPosts = input.posts
  const recentThreeHourCount = insight.activity.recentThreeHourCount
  const femalePostCount = insight.activity.femalePostCount
  const todayEventCount = insight.todayEventCount
  const upcomingEventCount = insight.upcomingEventCount
  const weekendEventCount = insight.weekendEventCount
  const womenRatio = insight.activity.womenRatio
  const priceLabel = point.store.priceNote?.trim() || '公式で確認'
  const temperatureLabel =
    insight.heatScore >= 76
      ? '投稿の動きが強い'
      : insight.heatScore >= 48
        ? '比較候補'
        : '追加観測'
  const primaryReason =
    recentPosts.length > 0
      ? `当日顧客投稿 ${recentPosts.length}件`
      : todayEventCount > 0
      ? '本日のイベントあり'
      : recentThreeHourCount > 0
        ? '直近3時間で投稿あり'
        : point.signals.totalSignals > 0
          ? `注目シグナル ${point.signals.totalSignals}件`
          : '巡回データを蓄積中'
  const todayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(generatedAt))
  const nextEvent = input.events
    .filter((event) => event.date === '今日' || event.date >= todayKey)
    .toSorted((left, right) => left.date.localeCompare(right.date) || left.startsAt.localeCompare(right.startsAt))[0]

  return {
    insight,
    store: point.store,
    point,
    source,
    nextEvent,
    areaLabel,
    stationLabel: point.store.nearestStation?.trim() || areaLabel,
    addressLabel: point.store.address?.trim() || '住所は公式で確認',
    officialUrl,
    bbsUrl,
    mapUrl: resolvedStoreMapUrl(point.store),
    priceLabel,
    sessionLabel: formatStoreSessionLabel(point.store),
    womenRatio,
    femalePostCount,
    recentPostCount: recentPosts.length,
    recentThreeHourCount,
    todayEventCount,
    upcomingEventCount,
    weekendEventCount,
    lastUpdatedAt,
    lastUpdatedLabel: formatRelativeUpdate(lastUpdatedAt, generatedAt),
    isOpenNow: insight.isOpenNow,
    temperatureLabel,
    primaryReason,
    dataConfidence: insight.dataConfidence,
    dataConfidenceLabel: insight.dataConfidenceLabel,
    businessWindowLabel: insight.businessWindowLabel,
    reliabilityLabel: insight.reliabilityLabel,
    excludedUntimestampedCount: insight.excludedUntimestampedCount,
  }
}

function latestDate(values: Array<string | undefined>, referenceAt: string) {
  const futureTolerance = new Date(referenceAt).getTime() + 10 * 60_000
  const sorted = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value) && value <= futureTolerance)
    .toSorted((a, b) => b - a)
  return sorted[0] ? new Date(sorted[0]).toISOString() : undefined
}

function formatRelativeUpdate(value: string | undefined, reference: string) {
  if (!value) return '更新待ち'
  const diffMs = new Date(reference).getTime() - new Date(value).getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return '更新あり'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return `${Math.max(1, minutes)}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  return `${days}日前`
}

function inferStoreArea(store: StoreProfile) {
  const explicit = formatStoreArea(store.area)
  return explicit === 'エリア未登録' ? 'エリア未確認' : explicit
}

export function storeDetailPath(store: StoreProfile) {
  return `/shops/${encodeURIComponent(store.id)}`
}

export function publicAbsoluteUrl(path: string) {
  return new URL(path, siteUrl).toString()
}

export function formatPublicStoreName(store: StoreProfile) {
  return formatBarName(store.name)
}

export function getAreaLabelFromSlug(slug?: string) {
  return slug ? areaSlugMap[slug] : undefined
}

export function areaSlugForLabel(label: string) {
  const found = Object.entries(areaSlugMap).find(([slug, value]) => slug !== 'tokyo' && slug !== 'all' && label.includes(value))
  return found?.[0] ?? encodeURIComponent(label)
}

export function filterPublicStores(
  summaries: PublicStoreSummary[],
  options: {
    query?: string
    area?: string
    condition?: string
    ranking?: RankingKind
  },
) {
  const query = options.query?.trim() ?? ''
  const areaLabel = options.area && options.area !== 'all' ? getAreaLabelFromSlug(options.area) ?? options.area : ''
  const condition = options.condition as ConditionKey | undefined

  let items = summaries.filter((summary) => {
    if (query) {
      const searchableValues = [
        summary.store.name,
        summary.areaLabel,
        summary.stationLabel,
        summary.addressLabel,
        summary.priceLabel,
        summary.sessionLabel,
        (summary.store.tags ?? []).join(' '),
        (summary.store.strongDays ?? []).join(' '),
        (summary.store.strongEvents ?? []).join(' '),
        summary.nextEvent?.title,
        summary.nextEvent?.details,
      ]
      if (!matchesStoreSearch(query, searchableValues)) return false
    }
    if (areaLabel === '東京全域' && !tokyoAreaFragments.some((fragment) => summary.areaLabel.includes(fragment))) return false
    if (areaLabel && areaLabel !== '東京全域' && !summary.areaLabel.includes(areaLabel)) return false
    if (condition && !matchesCondition(summary, condition)) return false
    return true
  })

  if (options.ranking) items = sortByRanking(items, options.ranking)
  return items
}

export function matchesCondition(summary: PublicStoreSummary, condition: ConditionKey) {
  if (condition === 'hot') return summary.point.score >= 74 || summary.recentThreeHourCount > 0
  if (condition === 'open') return summary.isOpenNow
  if (condition === 'events') return summary.todayEventCount > 0 || summary.upcomingEventCount > 0
  if (condition === 'female') return summary.femalePostCount > 0 || (summary.womenRatio ?? 0) >= 45
  if (condition === 'fresh') return summary.recentThreeHourCount > 0 || /分前|1時間前|2時間前|3時間前/.test(summary.lastUpdatedLabel)
  if (condition === 'price') return summary.priceLabel !== '公式で確認'
  if (condition === 'beginner') {
    const haystack = [
      summary.store.tags.join(' '),
      summary.store.prStructure,
      summary.store.strongEvents.join(' '),
      summary.store.weakEvents.join(' '),
      summary.priceLabel,
    ].join(' ')
    return /初回|初心者|はじめて|初めて|無料|入門|ビギナー/i.test(haystack)
  }
  if (condition === 'day') return summary.store.hasDaytime
  if (condition === 'night') return summary.store.hasNight
  return true
}

export function sortByRanking(summaries: PublicStoreSummary[], ranking: RankingKind) {
  return [...summaries].toSorted((a, b) => {
    if (ranking === 'events') {
      return b.todayEventCount - a.todayEventCount || b.upcomingEventCount - a.upcomingEventCount || compareDailyPostActivity(a, b)
    }
    if (ranking === 'open') return Number(b.isOpenNow) - Number(a.isOpenNow) || compareDailyPostActivity(a, b)
    if (ranking === 'weekend') return b.weekendEventCount - a.weekendEventCount || compareDailyPostActivity(a, b)
    if (ranking === 'female') return compareFemalePostActivity(a, b)
    return compareDailyPostActivity(a, b)
  })
}

function compareDailyPostActivity(a: PublicStoreSummary, b: PublicStoreSummary) {
  return (
    b.recentPostCount - a.recentPostCount ||
    b.recentThreeHourCount - a.recentThreeHourCount ||
    b.dataConfidence - a.dataConfidence ||
    b.point.score - a.point.score ||
    a.store.name.localeCompare(b.store.name, 'ja')
  )
}

function compareFemalePostActivity(a: PublicStoreSummary, b: PublicStoreSummary) {
  return (
    b.femalePostCount - a.femalePostCount ||
    b.recentThreeHourCount - a.recentThreeHourCount ||
    b.recentPostCount - a.recentPostCount ||
    (b.womenRatio ?? -1) - (a.womenRatio ?? -1) ||
    b.point.score - a.point.score
  )
}

export function buildPublicFaqSchema() {
  return [
    {
      question: 'Night Radarは何を見るサービスですか？',
      answer: '公開BBS、イベント、巡回時刻、投稿傾向を店舗単位で整理し、今日どの店舗を検討するか判断しやすくするサービスです。',
    },
    {
      question: '来店人数は保証されますか？',
      answer: '保証ではありません。公開情報からの観測値と傾向として表示しています。',
    },
    {
      question: '店舗情報はどう確認しますか？',
      answer: '料金、住所、営業状況は各店舗の公式情報も合わせて確認してください。',
    },
  ]
}
