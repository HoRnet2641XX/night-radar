import { createHash, randomUUID } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import { buildDailyStoreDataset } from '../daily-store-insights'
import { events as demoEvents, posts as demoPosts, stores as demoStores, storeSituations, wordCategories } from '../demo-data'
import { highestAudienceForPlan, normalizePlan, planLimitMessage, planLimits, planRank } from '../plans'
import { collectPagedRows } from '../pagination'
import { mergeOfficialEvents } from '../official-events'
import { resolvedStoreArea } from '../store-catalog'
import {
  buildSearchableBbsRecords,
  extractNormalizedBbsPostsFromText,
  filterPostsWithinHours,
  isStructurallyValidCustomerNormalizedPost,
  normalizedBbsPostIdentityMaterial,
  scoreEvents,
  searchExactBbsTerms,
} from '../scoring'
import { eventWeekday } from '../date'
import type {
  BbsSnapshot,
  BbsNormalizedPost,
  BbsSource,
  CrawlRun,
  DashboardState,
  EventInput,
  ExactTermSearchGroup,
  ExactTermState,
  ImportBatch,
  NotificationJob,
  NotificationPreference,
  PlanKey,
  PostRecord,
  RuntimeMode,
  ScoredEvent,
  StoreDecisionState,
  StoreProfile,
  StoreSituation,
  SubscriptionState,
  WordBookmark,
} from '../types'
import { createSupabaseAdminClient, createSupabaseServerClient } from '../supabase/server'
import { buildBbsSnapshot, createBrowserSnapshotSession } from './bbs-snapshot'
import type { BrowserSnapshotSession } from './bbs-snapshot'
import { scrapePublicPage, scrapeResultToPost } from './scrape'
import { getServiceSetupStatus } from './setup-status'
import { dispatchNotification } from './notifications'

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>
type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>
type DataClient = SupabaseServerClient | SupabaseAdminClient
type DbRow = Record<string, unknown>
type DbListResult = { data: DbRow[] | null; error: { code?: string; message?: string } | null }
type RecordKind = 'stores' | 'events' | 'posts' | 'situations' | 'bbsSources'
type CrawlSourceResult = {
  source: BbsSource
  run: CrawlRun
  post: PostRecord | null
  snapshot: BbsSnapshot | null
  normalizedPosts: BbsNormalizedPost[]
}
type WriteAccess =
  | { mode: 'database'; supabase: SupabaseServerClient; user: User }
  | { mode: 'demo'; message: string }
  | { mode: 'anonymous'; message: string }

export class RepositoryError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export const defaultExactTerms: ExactTermState = {
  popularSingleMale: '人気単男A',
  popularSingleFemale: '人気単女B',
  negativePerson: '苦手さんC',
}

export const defaultNotificationPreference: NotificationPreference = {
  email: '',
  webhookUrl: '',
  channel: 'in_app',
  audience: 'free',
}

const recentDashboardPostWindowHours = 48
const storeSelectColumns =
  'id,name,area,address,nearest_station,phone,official_url,map_url,price_note,tags,has_daytime,has_night,opening_hour_day,opening_hour_night,pr_structure,strong_days,strong_events,weak_events,trust_seed,created_at'
const legacyStoreSelectColumns =
  'id,name,area,has_daytime,has_night,opening_hour_day,opening_hour_night,pr_structure,strong_days,strong_events,weak_events,trust_seed,created_at'
const eventSelectColumns = 'id,store_id,date_label,weekday,starts_at,session,category,title,details,source_url,created_at'
const postSelectColumns = 'id,store_id,source,source_url,posted_at,body,keywords,created_at'
const situationSelectColumns = 'id,store_id,status,title,note,source_url,observed_at'
const sourceSelectColumns =
  'id,store_id,label,url,parser_type,active,crawl_interval_minutes,last_fetched_at,last_status,last_message,created_at'
const crawlRunSelectColumns = 'id,source_id,store_id,url,status,message,fetched_at,post_id'
const snapshotLightSelectColumns = 'id,source_id,store_id,url,metrics,radar_score,captured_at'
const snapshotContextSelectColumns = 'id,source_id,store_id,url,extracted_text,captured_at'
const snapshotSearchSelectColumns = 'id,source_id,store_id,url,metrics,radar_score,captured_at,extracted_text'
const normalizedPostSelectColumns =
  'id,source_id,store_id,source_url,article_no,author_name,author_gender,posted_at,observed_at,body,body_hash,content_key'
const exactTermSelectColumns = 'id,user_id,term_group,term,created_at'
const wordBookmarkSelectColumns = 'id,user_id,label,pattern,match_type,created_at'
const notificationJobSelectColumns = 'id,user_id,title,body,channel,audience,scheduled_for,status,created_at'
const notificationPreferenceSelectColumns = 'user_id,email,webhook_url,channel,audience'
const importBatchSelectColumns = 'id,user_id,kind,imported_count,error_count,created_at'
const subscriptionSelectColumns = 'user_id,plan,status,stripe_customer_id,stripe_subscription_id'
const storeDecisionSelectColumns = 'id,user_id,store_id,decision,updated_at'

function isoHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function demoDashboardState(mode: RuntimeMode = 'demo', connectionNote?: string): DashboardState {
  const setupStatus = getServiceSetupStatus()
  const dailyDataset = buildDailyStoreDataset({
    stores: demoStores,
    events: demoEvents,
    rawPosts: demoPosts,
    sources: [],
    snapshots: [],
    normalizedPosts: [],
    referenceAt: setupStatus.generatedAt,
  })
  const scoredEvents = scoreEvents(demoEvents, demoStores, dailyDataset.effectivePosts)

  return {
    mode,
    connectionNote,
    setupStatus,
    stores: demoStores,
    events: demoEvents,
    posts: dailyDataset.effectivePosts,
    scoredEvents,
    situations: storeSituations,
    bbsSources: [],
    crawlRuns: [],
    bbsSnapshots: [],
    bbsNormalizedPosts: [],
    dailyInsights: dailyDataset.insights,
    storeDecisions: {},
    exactTerms: defaultExactTerms,
    wordBookmarks: [],
    notificationJobs: [],
    notificationPreference: defaultNotificationPreference,
    importBatches: [],
    subscription: { plan: 'free', status: 'inactive' },
    wordCategories,
  }
}

function ensureId(value?: string) {
  const trimmed = value?.trim()
  return trimmed || randomUUID()
}

function listValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean)
  return String(value ?? '')
    .split(/[,\n、]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function bodyHash(body: string) {
  return createHash('sha256').update(body.replace(/\s+/g, ' ').trim()).digest('hex')
}

function metadataString(user: User, key: string) {
  const value = user.user_metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function userDisplayName(user: User) {
  return (
    user.email ??
    metadataString(user, 'full_name') ??
    metadataString(user, 'name') ??
    metadataString(user, 'user_name') ??
    metadataString(user, 'preferred_username') ??
    metadataString(user, 'screen_name') ??
    'Xでログイン中'
  )
}

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

function toStoreRow(store: StoreProfile, ownerId: string) {
  return {
    id: store.id,
    owner_id: ownerId || null,
    name: store.name,
    area: store.area,
    address: store.address || null,
    nearest_station: store.nearestStation || null,
    phone: store.phone || null,
    official_url: store.officialUrl || null,
    map_url: store.mapUrl || null,
    price_note: store.priceNote || null,
    tags: store.tags,
    has_daytime: store.hasDaytime,
    has_night: store.hasNight,
    opening_hour_day: store.openingHourDay,
    opening_hour_night: store.openingHourNight,
    pr_structure: store.prStructure,
    strong_days: store.strongDays,
    strong_events: store.strongEvents,
    weak_events: store.weakEvents,
    trust_seed: store.trustSeed,
  }
}

function normalizeStore(input: Partial<StoreProfile>): StoreProfile {
  const name = String(input.name ?? '').trim()
  if (!name) throw new RepositoryError('店舗名が必要です。', 422)

  return {
    id: ensureId(input.id),
    name,
    area: String(input.area ?? '未設定'),
    address: String(input.address ?? '').trim() || undefined,
    nearestStation: String(input.nearestStation ?? '').trim() || undefined,
    phone: String(input.phone ?? '').trim() || undefined,
    officialUrl: String(input.officialUrl ?? '').trim() || undefined,
    mapUrl: String(input.mapUrl ?? '').trim() || undefined,
    priceNote: String(input.priceNote ?? '').trim() || undefined,
    tags: listValue(input.tags),
    hasDaytime: Boolean(input.hasDaytime),
    hasNight: input.hasNight ?? true,
    openingHourDay: String(input.openingHourDay ?? '13:00'),
    openingHourNight: String(input.openingHourNight ?? '19:00'),
    prStructure: String(input.prStructure ?? '未分類'),
    strongDays: listValue(input.strongDays),
    strongEvents: listValue(input.strongEvents),
    weakEvents: listValue(input.weakEvents),
    trustSeed: Math.max(0, Math.min(100, Number(input.trustSeed ?? 60))),
  }
}

function toEvent(row: DbRow): EventInput {
  const event: EventInput = {
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
  return { ...event, weekday: eventWeekday(event) }
}

function toEventRow(event: EventInput) {
  return {
    id: event.id,
    store_id: event.storeId,
    date_label: event.date,
    weekday: eventWeekday(event),
    starts_at: event.startsAt,
    session: event.session,
    category: event.category,
    title: event.title,
    details: event.details || '',
    source_url: event.sourceUrl || null,
  }
}

function normalizeEvent(input: Partial<EventInput>): EventInput {
  const title = String(input.title ?? '').trim()
  if (!title) throw new RepositoryError('イベント名が必要です。', 422)
  if (!input.storeId) throw new RepositoryError('店舗を選択してください。', 422)

  const event: EventInput = {
    id: ensureId(input.id),
    storeId: input.storeId,
    date: String(input.date || '今日'),
    weekday: String(input.weekday || '未設定'),
    startsAt: String(input.startsAt || '19:00'),
    session: input.session === 'day' ? 'day' : 'night',
    category: String(input.category || '未分類'),
    title,
    details: input.details ? String(input.details) : undefined,
    sourceUrl: input.sourceUrl || undefined,
  }
  return { ...event, weekday: eventWeekday(event) }
}

function toPost(row: DbRow): PostRecord {
  return {
    id: stringField(row, 'id'),
    storeId: stringField(row, 'store_id'),
    source: stringField(row, 'source', 'manual') as PostRecord['source'],
    sourceUrl: optionalStringField(row, 'source_url'),
    postedAt: stringField(row, 'posted_at'),
    body: stringField(row, 'body'),
    keywords: stringArrayField(row, 'keywords'),
  }
}

function toBusinessContextPost(row: DbRow): PostRecord {
  return {
    id: `business-context-${stringField(row, 'id')}`,
    storeId: stringField(row, 'store_id'),
    source: 'scrape',
    sourceUrl: optionalStringField(row, 'url'),
    postedAt: stringField(row, 'captured_at'),
    body: stringField(row, 'extracted_text'),
    keywords: [],
  }
}

function toPostRow(post: PostRecord) {
  return {
    id: post.id,
    store_id: post.storeId,
    source: post.source,
    source_url: post.sourceUrl || null,
    posted_at: post.postedAt,
    body: post.body,
    body_hash: bodyHash(post.body),
    keywords: post.keywords,
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

function normalizedPostContentKey(input: {
  articleNo?: string
  authorName: string
  postedAt?: string
  body: string
}) {
  const articleNo = input.articleNo?.trim()
  if (articleNo) return `article:${articleNo}`

  return `body:${bodyHash(normalizedBbsPostIdentityMaterial({
    articleNo: undefined,
    authorName: input.authorName,
    postedAt: input.postedAt,
    body: input.body,
  }))}`
}

function toBbsNormalizedPostRow(input: {
  source: BbsSource
  observedAt: string
  post: ReturnType<typeof extractNormalizedBbsPostsFromText>[number]
}) {
  const body = input.post.body.trim()
  const articleNo = input.post.articleNo?.trim() || null
  const authorName = input.post.authorName.trim() || '記載なし'
  const authorGender = input.post.authorGender.trim() || '記載なし'

  return {
    id: randomUUID(),
    source_id: input.source.id,
    store_id: input.source.storeId,
    source_url: input.source.url,
    article_no: articleNo,
    author_name: authorName,
    author_gender: authorGender,
    posted_at: input.post.postedAt || null,
    observed_at: input.observedAt,
    body,
    body_hash: bodyHash(body),
    content_key: normalizedPostContentKey({
      articleNo: articleNo ?? undefined,
      authorName,
      postedAt: input.post.postedAt,
      body,
    }),
  }
}

function normalizePost(input: Partial<PostRecord>): PostRecord {
  const body = String(input.body ?? '').trim()
  if (!body) throw new RepositoryError('投稿本文が必要です。', 422)
  if (!input.storeId) throw new RepositoryError('店舗を選択してください。', 422)

  return {
    id: ensureId(input.id),
    storeId: input.storeId,
    source: input.source ?? 'manual',
    sourceUrl: input.sourceUrl || undefined,
    postedAt: input.postedAt || new Date().toISOString(),
    body,
    keywords: listValue(input.keywords),
  }
}

function toSituation(row: DbRow): StoreSituation {
  return {
    id: stringField(row, 'id'),
    storeId: stringField(row, 'store_id'),
    status: stringField(row, 'status', 'watch') as StoreSituation['status'],
    title: stringField(row, 'title'),
    note: stringField(row, 'note'),
    sourceUrl: optionalStringField(row, 'source_url'),
    observedAt: stringField(row, 'observed_at'),
  }
}

function toSituationRow(situation: StoreSituation) {
  return {
    id: situation.id,
    store_id: situation.storeId,
    status: situation.status,
    title: situation.title,
    note: situation.note,
    source_url: situation.sourceUrl || null,
    observed_at: situation.observedAt,
  }
}

function normalizeSituation(input: Partial<StoreSituation>): StoreSituation {
  const title = String(input.title ?? '').trim()
  if (!title) throw new RepositoryError('状況タイトルが必要です。', 422)
  if (!input.storeId) throw new RepositoryError('店舗を選択してください。', 422)

  return {
    id: ensureId(input.id),
    storeId: input.storeId,
    status: input.status ?? 'watch',
    title,
    note: String(input.note ?? ''),
    sourceUrl: input.sourceUrl || undefined,
    observedAt: input.observedAt || new Date().toISOString(),
  }
}

function toBbsSource(row: DbRow): BbsSource {
  return {
    id: stringField(row, 'id'),
    storeId: stringField(row, 'store_id'),
    label: stringField(row, 'label', 'BBS'),
    url: stringField(row, 'url'),
    parserType: stringField(row, 'parser_type', 'auto') as BbsSource['parserType'],
    active: booleanField(row, 'active', true),
    crawlIntervalMinutes: numberField(row, 'crawl_interval_minutes', 360),
    lastFetchedAt: optionalStringField(row, 'last_fetched_at'),
    lastStatus: stringField(row, 'last_status', 'pending') as BbsSource['lastStatus'],
    lastMessage: optionalStringField(row, 'last_message'),
  }
}

function toBbsSourceRow(source: BbsSource) {
  return {
    id: source.id,
    store_id: source.storeId,
    label: source.label,
    url: source.url,
    parser_type: source.parserType,
    active: source.active,
    crawl_interval_minutes: source.crawlIntervalMinutes,
    last_fetched_at: source.lastFetchedAt || null,
    last_status: source.lastStatus ?? 'pending',
    last_message: source.lastMessage || null,
  }
}

function normalizeBbsSource(input: Partial<BbsSource>): BbsSource {
  if (!input.storeId) throw new RepositoryError('店舗を選択してください。', 422)
  const url = String(input.url ?? '').trim()
  try {
    new URL(url)
  } catch {
    throw new RepositoryError('BBS URLが不正です。', 422)
  }

  return {
    id: ensureId(input.id),
    storeId: input.storeId,
    label: String(input.label || 'BBS'),
    url,
    parserType: input.parserType ?? 'auto',
    active: input.active ?? true,
    crawlIntervalMinutes: Math.max(5, Math.min(10080, Number(input.crawlIntervalMinutes ?? 360))),
    lastFetchedAt: input.lastFetchedAt,
    lastStatus: input.lastStatus ?? 'pending',
    lastMessage: input.lastMessage,
  }
}

function toNotificationJob(row: DbRow): NotificationJob {
  return {
    id: stringField(row, 'id'),
    title: stringField(row, 'title'),
    body: stringField(row, 'body'),
    channel: stringField(row, 'channel') as NotificationJob['channel'],
    audience: stringField(row, 'audience', 'free') as NotificationJob['audience'],
    scheduledFor: stringField(row, 'scheduled_for'),
    status: stringField(row, 'status', 'queued') as NotificationJob['status'],
  }
}

function toNotificationPreference(row?: DbRow | null): NotificationPreference {
  if (!row) return defaultNotificationPreference

  return {
    email: stringField(row, 'email'),
    webhookUrl: stringField(row, 'webhook_url'),
    channel: stringField(row, 'channel', 'in_app') as NotificationPreference['channel'],
    audience: normalizePlan(stringField(row, 'audience', 'free')),
  }
}

function normalizeNotificationPreference(input: Partial<NotificationPreference>, plan: PlanKey): NotificationPreference {
  const channel = input.channel === 'email' || input.channel === 'webhook' ? input.channel : 'in_app'
  const requestedAudience = normalizePlan(input.audience)
  const audience = planRank[requestedAudience] > planRank[plan] ? highestAudienceForPlan(plan) : requestedAudience

  return {
    email: String(input.email ?? '').trim(),
    webhookUrl: String(input.webhookUrl ?? '').trim(),
    channel,
    audience,
  }
}

function toNotificationPreferenceRow(preference: NotificationPreference, userId: string) {
  return {
    user_id: userId,
    email: preference.email || null,
    webhook_url: preference.webhookUrl || null,
    channel: preference.channel,
    audience: preference.audience,
  }
}

function toNotificationRow(job: NotificationJob, userId?: string) {
  return {
    id: job.id || randomUUID(),
    user_id: userId ?? null,
    title: job.title,
    body: job.body,
    channel: job.channel,
    audience: job.audience,
    scheduled_for: job.scheduledFor,
    status: job.status,
  }
}

function toImportBatch(row: DbRow): ImportBatch {
  return {
    id: stringField(row, 'id'),
    kind: stringField(row, 'kind', 'posts') as ImportBatch['kind'],
    importedCount: numberField(row, 'imported_count'),
    errorCount: numberField(row, 'error_count'),
    createdAt: stringField(row, 'created_at'),
  }
}

function toCrawlRun(row: DbRow): CrawlRun {
  return {
    id: stringField(row, 'id'),
    sourceId: optionalStringField(row, 'source_id'),
    storeId: stringField(row, 'store_id'),
    url: stringField(row, 'url'),
    status: stringField(row, 'status', 'pending') as CrawlRun['status'],
    message: optionalStringField(row, 'message'),
    fetchedAt: stringField(row, 'fetched_at'),
    postId: optionalStringField(row, 'post_id'),
  }
}

function toBbsSnapshot(row: DbRow): BbsSnapshot {
  return {
    id: stringField(row, 'id'),
    sourceId: optionalStringField(row, 'source_id'),
    storeId: stringField(row, 'store_id'),
    url: stringField(row, 'url'),
    screenshotDataUrl: optionalStringField(row, 'screenshot_data_url'),
    extractedText: stringField(row, 'extracted_text'),
    metrics: (row.metrics ?? {
      femaleOnly: 0,
      firstVisit: 0,
      comeback: 0,
      groupVisit: 0,
      emoji: 0,
      totalSignals: 0,
      textLength: 0,
    }) as BbsSnapshot['metrics'],
    radarScore: numberField(row, 'radar_score'),
    capturedAt: stringField(row, 'captured_at'),
  }
}

function toBbsSnapshotRow(snapshot: BbsSnapshot) {
  return {
    id: snapshot.id,
    source_id: snapshot.sourceId ?? null,
    store_id: snapshot.storeId,
    url: snapshot.url,
    screenshot_data_url: snapshot.screenshotDataUrl ?? null,
    extracted_text: snapshot.extractedText.slice(0, 12_000),
    metrics: snapshot.metrics,
    radar_score: snapshot.radarScore,
    captured_at: snapshot.capturedAt,
  }
}

function toWordBookmark(row: DbRow): WordBookmark {
  return {
    id: stringField(row, 'id'),
    label: stringField(row, 'label'),
    pattern: stringField(row, 'pattern'),
    matchType: stringField(row, 'match_type', 'exact') as WordBookmark['matchType'],
    createdAt: stringField(row, 'created_at'),
  }
}

function normalizeWordBookmark(input: Partial<WordBookmark>): WordBookmark {
  const pattern = String(input.pattern ?? '').trim()
  if (!pattern) throw new RepositoryError('ブックマークするワードが必要です。', 422)

  return {
    id: ensureId(input.id),
    label: String(input.label || pattern).trim(),
    pattern,
    matchType: input.matchType === 'regex' || input.matchType === 'emoji' ? input.matchType : 'exact',
    createdAt: input.createdAt || new Date().toISOString(),
  }
}

function toWordBookmarkRow(bookmark: WordBookmark, userId: string) {
  return {
    id: bookmark.id,
    user_id: userId,
    label: bookmark.label,
    pattern: bookmark.pattern,
    match_type: bookmark.matchType,
  }
}

function isMissingRelationError(error?: { code?: string; message?: string } | null) {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /user_store_decisions|relation .* does not exist|Could not find/i.test(error.message ?? '')
  )
}

function isMissingColumnError(error?: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '')
}

function storeDecisionRowsToState(rows?: DbRow[] | null): Record<string, StoreDecisionState> {
  const decisions: Record<string, StoreDecisionState> = {}
  rows?.forEach((row) => {
    const decision = stringField(row, 'decision')
    if (decision === 'candidate' || decision === 'favorite' || decision === 'hidden') {
      decisions[stringField(row, 'store_id')] = decision
    }
  })
  return decisions
}

function normalizeStoreDecision(input: { storeId?: string; decision?: string }) {
  const storeId = String(input.storeId ?? '').trim()
  if (!storeId) throw new RepositoryError('店舗を選択してください。', 422)

  const decision =
    input.decision === 'candidate' || input.decision === 'favorite' || input.decision === 'hidden' ? input.decision : 'watch'
  return { storeId, decision }
}

function toSubscription(row?: DbRow | null): SubscriptionState {
  return {
    plan: row ? normalizePlan(stringField(row, 'plan', 'free')) : 'free',
    status: row ? stringField(row, 'status', 'inactive') : 'inactive',
    stripeCustomerId: row ? optionalStringField(row, 'stripe_customer_id') : undefined,
    stripeSubscriptionId: row ? optionalStringField(row, 'stripe_subscription_id') : undefined,
  }
}

function exactRowsToState(rows: DbRow[] | null): ExactTermState {
  const grouped: Record<string, string[]> = {
    popularSingleMale: [],
    popularSingleFemale: [],
    negativePerson: [],
  }

  rows?.forEach((row) => {
    const group = stringField(row, 'term_group')
    if (group in grouped) grouped[group].push(stringField(row, 'term'))
  })

  return {
    popularSingleMale: grouped.popularSingleMale.join('\n') || defaultExactTerms.popularSingleMale,
    popularSingleFemale: grouped.popularSingleFemale.join('\n') || defaultExactTerms.popularSingleFemale,
    negativePerson: grouped.negativePerson.join('\n') || defaultExactTerms.negativePerson,
  }
}

export function exactStateToGroups(exactTerms: ExactTermState): ExactTermSearchGroup[] {
  return [
    {
      group: 'popularSingleMale',
      label: '人気単独男性',
      terms: listValue(exactTerms.popularSingleMale),
    },
    {
      group: 'popularSingleFemale',
      label: '人気単独女性',
      terms: listValue(exactTerms.popularSingleFemale),
    },
    {
      group: 'negativePerson',
      label: '不人気・苦手',
      terms: listValue(exactTerms.negativePerson),
    },
  ]
}

async function getWriteAccess(): Promise<WriteAccess> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return {
      mode: 'demo',
      message: 'Supabaseが未設定のため、この端末内だけに一時保存します。',
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      mode: 'anonymous',
      message: 'ログイン後に保存できます。',
    }
  }

  return { mode: 'database', supabase, user }
}

async function getPlanForAccess(access: Extract<WriteAccess, { mode: 'database' }>): Promise<PlanKey> {
  const { data, error } = await access.supabase
    .from('subscriptions')
    .select('plan,status')
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (error) throw new RepositoryError(error.message, 400)
  const subscription = toSubscription(data)
  return subscription.status === 'active' || subscription.status === 'trialing' ? subscription.plan : 'free'
}

async function getOwnedStoreIds(access: Extract<WriteAccess, { mode: 'database' }>) {
  const { data, error } = await access.supabase.from('stores').select('id').eq('owner_id', access.user.id)
  if (error) throw new RepositoryError(error.message, 400)
  return (data ?? []).map((row) => stringField(row, 'id')).filter(Boolean)
}

function assertDatabaseAccess(access: WriteAccess): asserts access is Extract<WriteAccess, { mode: 'database' }> {
  if (access.mode === 'anonymous') throw new RepositoryError(access.message, 401)
  if (access.mode === 'demo') throw new RepositoryError(access.message, 503)
}

function assertUserCatalogWriteDisabled(): never {
  throw new RepositoryError('店舗・イベント・BBSデータは運営管理です。管理側のCSV/seedで更新してください。', 403)
}

async function saveStoreWithAccess(access: Extract<WriteAccess, { mode: 'database' }>, input: Partial<StoreProfile>) {
  const store = normalizeStore(input)
  const { data, error } = await access.supabase
    .from('stores')
    .upsert(toStoreRow(store, access.user.id))
    .select('*')
    .single()
  if (error) throw new RepositoryError(error.message, 400)
  return toStore(data)
}

async function saveEventWithAccess(access: Extract<WriteAccess, { mode: 'database' }>, input: Partial<EventInput>) {
  const event = normalizeEvent(input)
  const { data, error } = await access.supabase.from('events').upsert(toEventRow(event)).select('*').single()
  if (error) throw new RepositoryError(error.message, 400)
  return toEvent(data)
}

async function savePostRow(supabase: DataClient, input: Partial<PostRecord>) {
  const post = normalizePost(input)
  const row = toPostRow(post)
  const { data: duplicate, error: lookupError } = await supabase
    .from('posts')
    .select('*')
    .eq('store_id', row.store_id)
    .eq('body_hash', row.body_hash)
    .maybeSingle()
  if (lookupError) throw new RepositoryError(lookupError.message, 400)
  if (duplicate) return toPost(duplicate)

  const { data, error } = await supabase.from('posts').insert(row).select('*').single()
  if (error?.code === '23505') {
    const { data: concurrentDuplicate, error: concurrentLookupError } = await supabase
      .from('posts')
      .select('*')
      .eq('store_id', row.store_id)
      .eq('body_hash', row.body_hash)
      .maybeSingle()
    if (concurrentLookupError) throw new RepositoryError(concurrentLookupError.message, 400)
    if (concurrentDuplicate) return toPost(concurrentDuplicate)
  }
  if (error) throw new RepositoryError(error.message, 400)
  return toPost(data)
}

async function saveNormalizedBbsPostsFromText(
  supabase: DataClient,
  source: BbsSource,
  extractedText: string,
  observedAt: string,
) {
  const posts = extractNormalizedBbsPostsFromText(extractedText, observedAt)
  if (!posts.length) return []

  const rows = posts
    .filter((post) => isStructurallyValidCustomerNormalizedPost({ ...post, storeId: source.storeId }))
    .map((post) => toBbsNormalizedPostRow({ source, observedAt, post }))
  if (!rows.length) return []
  const { data, error } = await supabase
    .from('bbs_normalized_posts')
    .upsert(rows, { onConflict: 'store_id,content_key' })
    .select('*')

  if (error) {
    if (isMissingRelationError(error)) return []
    throw new RepositoryError(error.message, 400)
  }

  return (data ?? []).map(toBbsNormalizedPost)
}

async function savePostWithAccess(access: Extract<WriteAccess, { mode: 'database' }>, input: Partial<PostRecord>) {
  return savePostRow(access.supabase, input)
}

async function saveSituationWithAccess(access: Extract<WriteAccess, { mode: 'database' }>, input: Partial<StoreSituation>) {
  const situation = normalizeSituation(input)
  const { data, error } = await access.supabase
    .from('store_situations')
    .upsert(toSituationRow(situation))
    .select('*')
    .single()
  if (error) throw new RepositoryError(error.message, 400)
  return toSituation(data)
}

async function saveBbsSourceWithAccess(access: Extract<WriteAccess, { mode: 'database' }>, input: Partial<BbsSource>) {
  const source = normalizeBbsSource(input)
  const plan = await getPlanForAccess(access)
  const limit = planLimits[plan].bbsSources
  const { data: existing, error: existingError } = await access.supabase
    .from('bbs_sources')
    .select('id')
    .eq('store_id', source.storeId)
    .eq('url', source.url)
    .maybeSingle()
  if (existingError) throw new RepositoryError(existingError.message, 400)

  if (!existing) {
    const storeIds = await getOwnedStoreIds(access)
    const { count, error: countError } = storeIds.length
      ? await access.supabase.from('bbs_sources').select('id', { count: 'exact', head: true }).in('store_id', storeIds)
      : { count: 0, error: null }
    if (countError) throw new RepositoryError(countError.message, 400)
    if ((count ?? 0) >= limit) throw new RepositoryError(planLimitMessage(plan, 'bbsSources'), 402)
  }

  const { data, error } = await access.supabase
    .from('bbs_sources')
    .upsert(toBbsSourceRow(source), { onConflict: 'store_id,url' })
    .select('*')
    .single()
  if (error) throw new RepositoryError(error.message, 400)
  return toBbsSource(data)
}

export async function getDashboardState(): Promise<DashboardState> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return demoDashboardState('demo', 'Supabase未接続')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return demoDashboardState('anonymous', 'ログイン待ち')

  let storeResult = (await supabase.from('stores').select(storeSelectColumns).order('created_at', { ascending: false })) as DbListResult
  if (isMissingColumnError(storeResult.error)) {
    storeResult = (await supabase.from('stores').select(legacyStoreSelectColumns).order('created_at', { ascending: false })) as DbListResult
  }
  if (storeResult.error) return demoDashboardState('demo', storeResult.error.message)

  const storeIds = (storeResult.data ?? []).map((row) => row.id)
  const stores = (storeResult.data ?? []).map(toStore)
  const recentPostThreshold = isoHoursAgo(recentDashboardPostWindowHours)

  const [
    eventResult,
    postResult,
    situationResult,
    sourceResult,
    crawlResult,
    snapshotResult,
    snapshotContextResult,
    normalizedPostResult,
    termResult,
    bookmarkResult,
    noticeResult,
    preferenceResult,
    importResult,
    subscriptionResult,
  ] =
    await Promise.all([
      storeIds.length
        ? supabase.from('events').select(eventSelectColumns).in('store_id', storeIds).order('created_at', { ascending: false }).limit(1500)
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
        ? supabase
            .from('store_situations')
            .select(situationSelectColumns)
            .in('store_id', storeIds)
            .order('observed_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      storeIds.length
        ? supabase.from('bbs_sources').select(sourceSelectColumns).in('store_id', storeIds).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      storeIds.length
        ? supabase.from('crawl_runs').select(crawlRunSelectColumns).in('store_id', storeIds).order('fetched_at', { ascending: false }).limit(20)
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
              .order('id', { ascending: false })
              .range(from, to)) as DbListResult,
          )
        : Promise.resolve({ data: [], error: null }),
      supabase.from('exact_terms').select(exactTermSelectColumns).eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('word_bookmarks').select(wordBookmarkSelectColumns).eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase
        .from('notification_jobs')
        .select(notificationJobSelectColumns)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('notification_preferences').select(notificationPreferenceSelectColumns).eq('user_id', user.id).maybeSingle(),
      supabase
        .from('import_batches')
        .select(importBatchSelectColumns)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12),
      supabase.from('subscriptions').select(subscriptionSelectColumns).eq('user_id', user.id).maybeSingle(),
    ])

  const normalizedPostError =
    normalizedPostResult.error && !isMissingRelationError(normalizedPostResult.error) ? normalizedPostResult.error : null
  const firstError =
    eventResult.error ||
    postResult.error ||
    situationResult.error ||
    sourceResult.error ||
    crawlResult.error ||
    snapshotResult.error ||
    snapshotContextResult.error ||
    normalizedPostError ||
    termResult.error ||
    bookmarkResult.error ||
    noticeResult.error ||
    preferenceResult.error ||
    importResult.error ||
    subscriptionResult.error
  if (firstError) return demoDashboardState('demo', firstError.message)

  let snapshotRows = snapshotResult.data ?? []
  if (normalizedPostResult.error && isMissingRelationError(normalizedPostResult.error) && storeIds.length) {
    const fallbackSnapshotResult = await supabase
      .from('bbs_snapshots')
      .select(snapshotSearchSelectColumns)
      .in('store_id', storeIds)
      .gte('captured_at', recentPostThreshold)
      .order('captured_at', { ascending: false })
      .limit(120)

    if (!fallbackSnapshotResult.error) snapshotRows = fallbackSnapshotResult.data ?? snapshotRows
  }

  const events = mergeOfficialEvents((eventResult.data ?? []).map(toEvent))
  const rawPosts = (postResult.data ?? []).map(toPost)
  const seenContextStores = new Set<string>()
  const businessContextPosts = (snapshotContextResult.data ?? [])
    .map(toBusinessContextPost)
    .filter((post) => {
      if (!post.body.trim() || seenContextStores.has(post.storeId)) return false
      seenContextStores.add(post.storeId)
      return true
    })
  const bbsNormalizedPosts = normalizedPostResult.error ? [] : (normalizedPostResult.data ?? []).map(toBbsNormalizedPost)
  const setupStatus = getServiceSetupStatus()
  const dailyDataset = buildDailyStoreDataset({
    stores,
    events,
    rawPosts,
    sources: (sourceResult.data ?? []).map(toBbsSource),
    snapshots: snapshotRows.map(toBbsSnapshot),
    normalizedPosts: bbsNormalizedPosts,
    businessContextPosts,
    referenceAt: setupStatus.generatedAt,
  })
  const posts = dailyDataset.effectivePosts
  const scoredEvents = scoreEvents(events, stores, posts)
  const decisionResult = await supabase.from('user_store_decisions').select(storeDecisionSelectColumns).eq('user_id', user.id)
  if (decisionResult.error && !isMissingRelationError(decisionResult.error)) {
    return demoDashboardState('demo', decisionResult.error.message)
  }

  return {
    mode: 'database',
    userId: user.id,
    userEmail: user.email ?? undefined,
    userDisplayName: userDisplayName(user),
    setupStatus,
    stores,
    events,
    posts,
    businessContextPosts,
    scoredEvents,
    situations: (situationResult.data ?? []).map(toSituation),
    bbsSources: (sourceResult.data ?? []).map(toBbsSource),
    crawlRuns: (crawlResult.data ?? []).map(toCrawlRun),
    bbsSnapshots: snapshotRows.map(toBbsSnapshot),
    bbsNormalizedPosts,
    dailyInsights: dailyDataset.insights,
    storeDecisions: storeDecisionRowsToState(decisionResult.error ? [] : decisionResult.data),
    exactTerms: exactRowsToState(termResult.data),
    wordBookmarks: (bookmarkResult.data ?? []).map(toWordBookmark),
    notificationJobs: (noticeResult.data ?? []).map(toNotificationJob),
    notificationPreference: toNotificationPreference(preferenceResult.data),
    importBatches: (importResult.data ?? []).map(toImportBatch),
    subscription: toSubscription(subscriptionResult.data),
    wordCategories,
  }
}

export async function saveRecord(kind: RecordKind, item: unknown) {
  const access = await getWriteAccess()
  if (access.mode === 'demo') {
    return {
      mode: 'demo' as const,
      message: access.message,
      item:
        kind === 'stores'
          ? normalizeStore(item as Partial<StoreProfile>)
          : kind === 'events'
            ? normalizeEvent(item as Partial<EventInput>)
            : kind === 'posts'
              ? normalizePost(item as Partial<PostRecord>)
              : kind === 'situations'
                ? normalizeSituation(item as Partial<StoreSituation>)
                : normalizeBbsSource(item as Partial<BbsSource>),
    }
  }
  assertDatabaseAccess(access)
  if (kind === 'stores' || kind === 'events' || kind === 'posts' || kind === 'situations' || kind === 'bbsSources') {
    assertUserCatalogWriteDisabled()
  }

  const saved =
    kind === 'stores'
      ? await saveStoreWithAccess(access, item as Partial<StoreProfile>)
      : kind === 'events'
        ? await saveEventWithAccess(access, item as Partial<EventInput>)
        : kind === 'posts'
          ? await savePostWithAccess(access, item as Partial<PostRecord>)
          : kind === 'situations'
            ? await saveSituationWithAccess(access, item as Partial<StoreSituation>)
            : await saveBbsSourceWithAccess(access, item as Partial<BbsSource>)

  return { mode: 'database' as const, item: saved }
}

export async function deleteRecord(kind: RecordKind, id: string) {
  const access = await getWriteAccess()
  if (access.mode === 'demo') return { mode: 'demo' as const, ok: true, message: access.message }
  assertDatabaseAccess(access)
  if (kind === 'stores' || kind === 'events' || kind === 'posts' || kind === 'situations' || kind === 'bbsSources') {
    assertUserCatalogWriteDisabled()
  }

  const table =
    kind === 'stores'
      ? 'stores'
      : kind === 'events'
        ? 'events'
        : kind === 'posts'
          ? 'posts'
          : kind === 'situations'
            ? 'store_situations'
            : 'bbs_sources'
  const { error } = await access.supabase.from(table).delete().eq('id', id)
  if (error) throw new RepositoryError(error.message, 400)

  return { mode: 'database' as const, ok: true }
}

export async function persistCsvItems(kind: 'stores' | 'events' | 'posts', items: Array<StoreProfile | EventInput | PostRecord>, errors: string[]) {
  const access = await getWriteAccess()
  if (access.mode === 'demo') {
    return { mode: 'demo' as const, items, message: access.message }
  }
  void kind
  void errors
  assertDatabaseAccess(access)
  assertUserCatalogWriteDisabled()
}

export async function saveAndSearchExactTerms(exactTerms: ExactTermState, fallback?: { stores?: StoreProfile[]; posts?: PostRecord[] }) {
  const access = await getWriteAccess()
  const groups = exactStateToGroups(exactTerms)

  if (access.mode === 'demo') {
    const stores = fallback?.stores ?? demoStores
    const posts = fallback?.posts ?? demoPosts
    return { mode: 'demo' as const, matches: searchExactBbsTerms(posts, stores, groups), exactTerms }
  }
  assertDatabaseAccess(access)
  const plan = await getPlanForAccess(access)
  const termLimit = planLimits[plan].exactTermsPerGroup
  const overLimitGroup = groups.find((group) => group.terms.length > termLimit)
  if (overLimitGroup) throw new RepositoryError(`${overLimitGroup.label}: ${planLimitMessage(plan, 'exactTermsPerGroup')}`, 402)

  await access.supabase.from('exact_terms').delete().eq('user_id', access.user.id)
  const termRows = groups.flatMap((group) =>
    group.terms.map((term) => ({
      id: randomUUID(),
      user_id: access.user.id,
      term_group: group.group,
      term,
    })),
  )
  if (termRows.length) {
    const { error } = await access.supabase.from('exact_terms').insert(termRows)
    if (error) throw new RepositoryError(error.message, 400)
  }

  const state = await getDashboardState()
  const searchableRecords = buildSearchableBbsRecords(state.posts, state.bbsSnapshots)
  const recentRecords = filterPostsWithinHours(searchableRecords, state.setupStatus.generatedAt, 24)
  const matches = searchExactBbsTerms(recentRecords, state.stores, groups)
  const persistableMatches = matches.filter((match) => !match.post.id.startsWith('snapshot-'))
  if (persistableMatches.length) {
    await access.supabase.from('exact_matches').upsert(
      persistableMatches.slice(0, 500).map((match) => ({
        id: match.id,
        user_id: access.user.id,
        post_id: match.post.id,
        store_id: match.store.id,
        term_group: match.group,
        term: match.term,
        snippet: match.snippet,
      })),
      { onConflict: 'user_id,term_group,term,post_id' },
    )
  }

  return { mode: 'database' as const, matches, exactTerms }
}

export async function saveWordBookmark(input: Partial<WordBookmark>) {
  const bookmark = normalizeWordBookmark(input)
  const access = await getWriteAccess()
  if (access.mode === 'demo') return { mode: 'demo' as const, message: access.message, bookmark }
  assertDatabaseAccess(access)

  const { data, error } = await access.supabase
    .from('word_bookmarks')
    .upsert(toWordBookmarkRow(bookmark, access.user.id), { onConflict: 'user_id,pattern,match_type' })
    .select('*')
    .single()
  if (error) throw new RepositoryError(error.message, 400)
  return { mode: 'database' as const, bookmark: toWordBookmark(data) }
}

export async function deleteWordBookmark(id: string) {
  const access = await getWriteAccess()
  if (access.mode === 'demo') return { mode: 'demo' as const, ok: true, message: access.message }
  assertDatabaseAccess(access)

  const { error } = await access.supabase.from('word_bookmarks').delete().eq('id', id).eq('user_id', access.user.id)
  if (error) throw new RepositoryError(error.message, 400)
  return { mode: 'database' as const, ok: true }
}

export async function saveUserStoreDecision(input: { storeId?: string; decision?: StoreDecisionState }) {
  const access = await getWriteAccess()
  const decision = normalizeStoreDecision(input)

  if (access.mode === 'demo') return { mode: 'demo' as const, message: access.message, decision }
  assertDatabaseAccess(access)

  if (decision.decision === 'watch') {
    const { error } = await access.supabase
      .from('user_store_decisions')
      .delete()
      .eq('user_id', access.user.id)
      .eq('store_id', decision.storeId)
    if (error) {
      if (isMissingRelationError(error)) {
        throw new RepositoryError('候補保存テーブルが未作成です。マイグレーション適用までは端末内に一時保存します。', 424)
      }
      throw new RepositoryError(error.message, 400)
    }
    return { mode: 'database' as const, decision }
  }

  const { error } = await access.supabase.from('user_store_decisions').upsert({
    user_id: access.user.id,
    store_id: decision.storeId,
    decision: decision.decision,
  })

  if (error) {
    if (isMissingRelationError(error)) {
      throw new RepositoryError('候補保存テーブルが未作成です。マイグレーション適用までは端末内に一時保存します。', 424)
    }
    throw new RepositoryError(error.message, 400)
  }

  return { mode: 'database' as const, decision }
}

async function persistNotificationJobs(jobs: NotificationJob[], userId?: string) {
  const supabase = createSupabaseAdminClient()
  if (!supabase || !userId) return
  await supabase.from('notification_jobs').upsert(jobs.map((job) => toNotificationRow(job, userId)))
}

async function dispatchCrawlFailureNotifications(
  supabase: DataClient,
  results: Array<{ source: BbsSource; run: CrawlRun }>,
) {
  if (process.env.CRAWL_FAILURE_NOTIFICATIONS !== '1') return []

  const failures = results.filter(({ run }) => run.status === 'blocked' || run.status === 'failed')
  if (!failures.length) return []

  const { data: preferences, error } = await supabase.from('notification_preferences').select('*')
  if (error || !preferences?.length) return []

  const dispatchedJobs: NotificationJob[] = []
  for (const preferenceRow of preferences) {
    const preference = toNotificationPreference(preferenceRow)
    const userId = stringField(preferenceRow, 'user_id')
    if (!userId) continue

    for (const { source, run } of failures.slice(0, 6)) {
      const job: NotificationJob = {
        id: `crawl-failure-${run.id}-${userId}`,
        title: `BBS巡回に失敗: ${source.label}`,
        body: `${source.url} の取得に失敗しました。状態: ${run.status}。${run.message ?? '詳細メッセージなし'}`,
        channel: preference.channel,
        audience: preference.audience,
        scheduledFor: new Date().toISOString(),
        status: 'queued',
      }
      const dispatched = await dispatchNotification(job, {
        recipient: preference.email,
        webhookUrl: preference.webhookUrl,
      })
      dispatchedJobs.push({ ...dispatched, id: job.id })
      await supabase.from('notification_jobs').upsert(toNotificationRow(dispatched, userId))
    }
  }

  return dispatchedJobs
}

export async function persistScoreSnapshot(scoredEvents: ScoredEvent[]) {
  const access = await getWriteAccess()
  if (access.mode !== 'database') return { mode: access.mode, saved: 0 }

  const rows = scoredEvents.slice(0, 50).map((event) => ({
    user_id: access.user.id,
    event_id: event.id,
    score: event.score,
    rank: event.rank,
    tone: event.tone,
    metrics: event.metrics,
    reasons: event.reasons,
  }))
  const { error } = await access.supabase.from('score_snapshots').insert(rows)
  if (error) throw new RepositoryError(error.message, 400)
  return { mode: 'database' as const, saved: rows.length }
}

export async function saveDispatchedNotifications(jobs: NotificationJob[]) {
  const access = await getWriteAccess()
  if (access.mode !== 'database') return { mode: access.mode, jobs }
  await persistNotificationJobs(jobs, access.user.id)
  return { mode: 'database' as const, jobs }
}

export async function saveNotificationPreference(input: Partial<NotificationPreference>) {
  const access = await getWriteAccess()
  if (access.mode === 'demo') {
    return {
      mode: 'demo' as const,
      message: access.message,
      preference: normalizeNotificationPreference(input, 'free'),
    }
  }
  assertDatabaseAccess(access)
  const plan = await getPlanForAccess(access)
  const preference = normalizeNotificationPreference(input, plan)
  const { data, error } = await access.supabase
    .from('notification_preferences')
    .upsert(toNotificationPreferenceRow(preference, access.user.id))
    .select('*')
    .single()
  if (error) throw new RepositoryError(error.message, 400)

  return { mode: 'database' as const, preference: toNotificationPreference(data) }
}

export async function getCurrentNotificationDelivery() {
  const access = await getWriteAccess()
  if (access.mode !== 'database') {
    return {
      mode: access.mode,
      plan: 'free' as PlanKey,
      preference: defaultNotificationPreference,
      message: access.message,
    }
  }

  const plan = await getPlanForAccess(access)
  const { data, error } = await access.supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', access.user.id)
    .maybeSingle()
  if (error) throw new RepositoryError(error.message, 400)

  return {
    mode: 'database' as const,
    plan,
    preference: toNotificationPreference(data),
  }
}

async function crawlSourceRow(
  supabase: DataClient,
  row: DbRow,
  options: {
    browserSession?: BrowserSnapshotSession | null
    captureBrowserScreenshot?: boolean
  } = {},
): Promise<CrawlSourceResult> {
  const source = toBbsSource(row)
  const result = await scrapePublicPage(source.url)
  const candidatePost = scrapeResultToPost(result, source.storeId)
  const post = candidatePost ? await savePostRow(supabase, candidatePost) : null
  const snapshot = result.status === 'ok' ? await buildBbsSnapshot(source, result, options.browserSession, options) : null
  const normalizedPosts =
    result.status === 'ok'
      ? await saveNormalizedBbsPostsFromText(supabase, source, snapshot?.extractedText ?? result.extractedText, result.fetchedAt)
      : []
  const fetchedAt = result.fetchedAt

  await supabase
    .from('bbs_sources')
    .update({
      last_fetched_at: fetchedAt,
      last_status: result.status,
      last_message: result.message ?? result.title ?? null,
    })
    .eq('id', source.id)

  const { data: runRow } = await supabase
    .from('crawl_runs')
    .insert({
      source_id: source.id,
      store_id: source.storeId,
      url: source.url,
      status: result.status,
      message: result.message ?? result.title ?? null,
      fetched_at: fetchedAt,
      post_id: post?.id ?? null,
    })
    .select('*')
    .single()

  const { data: snapshotRow } = snapshot
    ? await supabase.from('bbs_snapshots').insert(toBbsSnapshotRow(snapshot)).select('*').single()
    : { data: null }

  return {
    source: {
      ...source,
      lastFetchedAt: fetchedAt,
      lastStatus: result.status,
      lastMessage: result.message ?? result.title,
    },
    post,
    normalizedPosts,
    run: {
      id: runRow?.id ?? randomUUID(),
      sourceId: source.id,
      storeId: source.storeId,
      url: source.url,
      status: result.status,
      message: result.message ?? result.title,
      fetchedAt,
      postId: post?.id,
    },
    snapshot: snapshotRow ? toBbsSnapshot(snapshotRow) : snapshot,
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown error')
}

function fallbackFailedCrawlResult(row: DbRow, message: string, fetchedAt: string): CrawlSourceResult {
  const source = toBbsSource(row)
  return {
    source: {
      ...source,
      lastFetchedAt: fetchedAt,
      lastStatus: 'failed',
      lastMessage: message,
    },
    run: {
      id: randomUUID(),
      sourceId: source.id,
      storeId: source.storeId,
      url: source.url,
      status: 'failed',
      message,
      fetchedAt,
    },
    post: null,
    snapshot: null,
    normalizedPosts: [],
  }
}

async function saveFailedCrawlRun(supabase: DataClient, row: DbRow, error: unknown): Promise<CrawlSourceResult> {
  const source = toBbsSource(row)
  const fetchedAt = new Date().toISOString()
  const message = `巡回処理で例外が発生しました: ${errorMessage(error)}`.slice(0, 500)

  await supabase
    .from('bbs_sources')
    .update({
      last_fetched_at: fetchedAt,
      last_status: 'failed',
      last_message: message,
    })
    .eq('id', source.id)

  const { data } = await supabase
    .from('crawl_runs')
    .insert({
      source_id: source.id,
      store_id: source.storeId,
      url: source.url,
      status: 'failed',
      message,
      fetched_at: fetchedAt,
      post_id: null,
    })
    .select('*')
    .single()

  if (!data) return fallbackFailedCrawlResult(row, message, fetchedAt)

  return {
    source: {
      ...source,
      lastFetchedAt: fetchedAt,
      lastStatus: 'failed',
      lastMessage: message,
    },
    run: toCrawlRun(data),
    post: null,
    snapshot: null,
    normalizedPosts: [],
  }
}

async function crawlSourceRowSafely(
  supabase: DataClient,
  row: DbRow,
  options: {
    browserSession?: BrowserSnapshotSession | null
    captureBrowserScreenshot?: boolean
  } = {},
) {
  try {
    return await crawlSourceRow(supabase, row, options)
  } catch (error) {
    try {
      return await saveFailedCrawlRun(supabase, row, error)
    } catch {
      return fallbackFailedCrawlResult(row, `巡回処理で例外が発生しました: ${errorMessage(error)}`.slice(0, 500), new Date().toISOString())
    }
  }
}

export async function crawlUserBbsSources(sourceIds?: string[]) {
  void sourceIds
  const access = await getWriteAccess()
  if (access.mode === 'demo') return { mode: 'demo' as const, results: [], message: access.message }
  assertDatabaseAccess(access)
  throw new RepositoryError('BBS巡回は運営側の定期ジョブで実行します。', 403)
}

export type CronCrawlOptions = {
  batch?: number | 'auto'
  batchSize?: number
  captureBrowserScreenshots?: boolean
  excludeSourceIds?: string[]
  force?: boolean
  maxCrawls?: number
  sourceIds?: string[]
}

function normalizeCronBatchOptions(activeCount: number, options: CronCrawlOptions) {
  if (!options.batchSize) return null
  const size = Math.max(1, Math.min(10, Math.floor(options.batchSize)))
  const totalBatches = Math.max(1, Math.ceil(activeCount / size))
  const index =
    options.batch === 'auto'
      ? Math.floor(Date.now() / 300_000) % totalBatches
      : Math.max(0, Math.min(totalBatches - 1, Math.floor(options.batch ?? 0)))
  const start = index * size

  return {
    index,
    size,
    start,
    endExclusive: Math.min(start + size, activeCount),
    totalBatches,
  }
}

function normalizeCronSourceFilter(values?: string[]) {
  const normalized = values
    ?.map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.toLowerCase())

  return normalized?.length ? new Set(normalized) : null
}

function prioritizeBbsRowsForCrawl(rows: DbRow[]) {
  return [...rows].sort((a, b) => {
    const aTime = a.last_fetched_at ? new Date(String(a.last_fetched_at)).getTime() : 0
    const bTime = b.last_fetched_at ? new Date(String(b.last_fetched_at)).getTime() : 0
    if (aTime !== bTime) return aTime - bTime

    const aId = stringField(a, 'id')
    const bId = stringField(b, 'id')
    if (aId === 'neo-bbs') return -1
    if (bId === 'neo-bbs') return 1
    return aId.localeCompare(bId)
  })
}

function normalizeCronMaxCrawls(options: CronCrawlOptions) {
  const value = options.maxCrawls ?? Number(process.env.CRON_MAX_CRAWLS_PER_RUN)
  if (Number.isFinite(value) && value > 0) return Math.max(1, Math.min(10, Math.floor(value)))
  if (options.sourceIds?.length) return Math.max(1, Math.min(10, options.sourceIds.length))
  if (options.batchSize) return 1
  return 3
}

export async function crawlDueBbsSourcesForCron(options: CronCrawlOptions = {}) {
  const supabase = createSupabaseAdminClient()
  if (!supabase) throw new RepositoryError('SupabaseのService Role設定が不足しています。', 503)

  const { data, error } = await supabase.from('bbs_sources').select('*').eq('active', true).order('id').limit(30)
  if (error) throw new RepositoryError(error.message, 400)

  const sourceFilter = normalizeCronSourceFilter(options.sourceIds)
  const excludeFilter = normalizeCronSourceFilter(options.excludeSourceIds)
  const activeRows = (data ?? []).filter((row) => {
    const sourceId = stringField(row, 'id').toLowerCase()
    if (sourceFilter && !sourceFilter.has(sourceId)) return false
    if (excludeFilter?.has(sourceId)) return false
    return true
  })
  if (sourceFilter && activeRows.length === 0) throw new RepositoryError('指定したBBSソースが見つかりません。', 404)

  const batch = normalizeCronBatchOptions(activeRows.length, options)
  const selectedRows = batch ? activeRows.slice(batch.start, batch.endExclusive) : activeRows
  const now = Date.now()
  const dueRows = options.force
    ? selectedRows
    : selectedRows.filter((row) => {
        if (!row.last_fetched_at) return true
        const elapsedMinutes = (now - new Date(row.last_fetched_at).getTime()) / 60_000
        return elapsedMinutes >= Number(row.crawl_interval_minutes ?? 360)
      })
  const maxCrawls = normalizeCronMaxCrawls(options)
  const crawlRows = prioritizeBbsRowsForCrawl(dueRows).slice(0, maxCrawls)
  const captureBrowserScreenshots = options.captureBrowserScreenshots === true

  const results: CrawlSourceResult[] = []
  const browserSession = crawlRows.length && captureBrowserScreenshots ? await createBrowserSnapshotSession() : null
  try {
    if (browserSession) {
      for (const row of crawlRows) {
        results.push(
          await crawlSourceRowSafely(supabase, row, {
            browserSession,
            captureBrowserScreenshot: captureBrowserScreenshots,
          }),
        )
      }
    } else {
      results.push(
        ...(await Promise.all(
          crawlRows.map((row) =>
            crawlSourceRowSafely(supabase, row, {
              captureBrowserScreenshot: false,
            }),
          ),
        )),
      )
    }
  } finally {
    await browserSession?.close()
  }

  const failureNotifications = await dispatchCrawlFailureNotifications(supabase, results)

  return {
    mode: 'database' as const,
    checked: activeRows.length,
    selected: selectedRows.length,
    due: dueRows.length,
    crawled: results.length,
    skippedDue: Math.max(0, dueRows.length - crawlRows.length),
    batch,
    filters: {
      captureBrowserScreenshots,
      excludeSourceIds: options.excludeSourceIds ?? [],
      force: Boolean(options.force),
      maxCrawls,
      sourceIds: options.sourceIds ?? [],
    },
    results,
    failureNotificationCount: failureNotifications.length,
  }
}

export async function getCurrentSubscriptionForCheckout() {
  const access = await getWriteAccess()
  if (access.mode !== 'database') return null
  const { data } = await access.supabase.from('subscriptions').select('*').eq('user_id', access.user.id).maybeSingle()
  return { user: access.user, subscription: toSubscription(data) }
}
