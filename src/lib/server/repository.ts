import { createHash, randomUUID } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import { events as demoEvents, posts as demoPosts, stores as demoStores, storeSituations, wordCategories } from '../demo-data'
import { scoreEvents, searchExactBbsTerms } from '../scoring'
import type {
  BbsSource,
  CrawlRun,
  DashboardState,
  EventInput,
  ExactTermSearchGroup,
  ExactTermState,
  NotificationJob,
  PlanKey,
  PostRecord,
  RuntimeMode,
  ScoredEvent,
  StoreProfile,
  StoreSituation,
  SubscriptionState,
} from '../types'
import { createSupabaseAdminClient, createSupabaseServerClient } from '../supabase/server'
import { scrapePublicPage, scrapeResultToPost } from './scrape'

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>
type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>
type DataClient = SupabaseServerClient | SupabaseAdminClient
type DbRow = Record<string, unknown>
type RecordKind = 'stores' | 'events' | 'posts' | 'situations' | 'bbsSources'
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

function demoDashboardState(mode: RuntimeMode = 'demo', connectionNote?: string): DashboardState {
  const scoredEvents = scoreEvents(demoEvents, demoStores, demoPosts)

  return {
    mode,
    connectionNote,
    stores: demoStores,
    events: demoEvents,
    posts: demoPosts,
    scoredEvents,
    situations: storeSituations,
    bbsSources: [],
    exactTerms: defaultExactTerms,
    notificationJobs: [],
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
  return {
    id: stringField(row, 'id'),
    name: stringField(row, 'name'),
    area: stringField(row, 'area', '未設定'),
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
    owner_id: ownerId,
    name: store.name,
    area: store.area,
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
  return {
    id: stringField(row, 'id'),
    storeId: stringField(row, 'store_id'),
    date: stringField(row, 'date_label', '今日'),
    weekday: stringField(row, 'weekday', '未設定'),
    startsAt: stringField(row, 'starts_at', '19:00'),
    session: stringField(row, 'session') === 'day' ? 'day' : 'night',
    category: stringField(row, 'category', '未分類'),
    title: stringField(row, 'title'),
    sourceUrl: optionalStringField(row, 'source_url'),
  }
}

function toEventRow(event: EventInput) {
  return {
    id: event.id,
    store_id: event.storeId,
    date_label: event.date,
    weekday: event.weekday,
    starts_at: event.startsAt,
    session: event.session,
    category: event.category,
    title: event.title,
    source_url: event.sourceUrl || null,
  }
}

function normalizeEvent(input: Partial<EventInput>): EventInput {
  const title = String(input.title ?? '').trim()
  if (!title) throw new RepositoryError('イベント名が必要です。', 422)
  if (!input.storeId) throw new RepositoryError('店舗を選択してください。', 422)

  return {
    id: ensureId(input.id),
    storeId: input.storeId,
    date: String(input.date || '今日'),
    weekday: String(input.weekday || '未設定'),
    startsAt: String(input.startsAt || '19:00'),
    session: input.session === 'day' ? 'day' : 'night',
    category: String(input.category || '未分類'),
    title,
    sourceUrl: input.sourceUrl || undefined,
  }
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
    crawlIntervalMinutes: Math.max(15, Math.min(10080, Number(input.crawlIntervalMinutes ?? 360))),
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

function toSubscription(row?: DbRow | null): SubscriptionState {
  return {
    plan: (row ? stringField(row, 'plan', 'free') : 'free') as PlanKey,
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
      label: '人気単男',
      terms: listValue(exactTerms.popularSingleMale),
    },
    {
      group: 'popularSingleFemale',
      label: '人気単女',
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
      message: 'Supabase env is not configured. Changes are local to this browser session.',
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

function assertDatabaseAccess(access: WriteAccess): asserts access is Extract<WriteAccess, { mode: 'database' }> {
  if (access.mode === 'anonymous') throw new RepositoryError(access.message, 401)
  if (access.mode === 'demo') throw new RepositoryError(access.message, 503)
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
  if (error) throw new RepositoryError(error.message, 400)
  return toPost(data)
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

  const { data: storeRows, error: storeError } = await supabase
    .from('stores')
    .select('*')
    .order('created_at', { ascending: false })
  if (storeError) return demoDashboardState('demo', storeError.message)

  const storeIds = (storeRows ?? []).map((row) => row.id)
  const stores = (storeRows ?? []).map(toStore)

  const [eventResult, postResult, situationResult, sourceResult, termResult, noticeResult, subscriptionResult] =
    await Promise.all([
      storeIds.length
        ? supabase.from('events').select('*').in('store_id', storeIds).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      storeIds.length
        ? supabase.from('posts').select('*').in('store_id', storeIds).order('posted_at', { ascending: false }).limit(500)
        : Promise.resolve({ data: [], error: null }),
      storeIds.length
        ? supabase.from('store_situations').select('*').in('store_id', storeIds).order('observed_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      storeIds.length
        ? supabase.from('bbs_sources').select('*').in('store_id', storeIds).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase.from('exact_terms').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase
        .from('notification_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
    ])

  const firstError =
    eventResult.error ||
    postResult.error ||
    situationResult.error ||
    sourceResult.error ||
    termResult.error ||
    noticeResult.error ||
    subscriptionResult.error
  if (firstError) return demoDashboardState('demo', firstError.message)

  const events = (eventResult.data ?? []).map(toEvent)
  const posts = (postResult.data ?? []).map(toPost)
  const scoredEvents = scoreEvents(events, stores, posts)

  return {
    mode: 'database',
    userEmail: user.email ?? undefined,
    stores,
    events,
    posts,
    scoredEvents,
    situations: (situationResult.data ?? []).map(toSituation),
    bbsSources: (sourceResult.data ?? []).map(toBbsSource),
    exactTerms: exactRowsToState(termResult.data),
    notificationJobs: (noticeResult.data ?? []).map(toNotificationJob),
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
  assertDatabaseAccess(access)

  const saved: Array<StoreProfile | EventInput | PostRecord> = []
  for (const item of items) {
    if (kind === 'stores') saved.push(await saveStoreWithAccess(access, item as StoreProfile))
    if (kind === 'events') saved.push(await saveEventWithAccess(access, item as EventInput))
    if (kind === 'posts') saved.push(await savePostWithAccess(access, item as PostRecord))
  }

  await access.supabase.from('import_batches').insert({
    user_id: access.user.id,
    kind,
    imported_count: saved.length,
    error_count: errors.length,
    errors,
  })

  return { mode: 'database' as const, items: saved }
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
  const matches = searchExactBbsTerms(state.posts, state.stores, groups)
  if (matches.length) {
    await access.supabase.from('exact_matches').upsert(
      matches.slice(0, 500).map((match) => ({
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

async function persistNotificationJobs(jobs: NotificationJob[], userId?: string) {
  const supabase = createSupabaseAdminClient()
  if (!supabase || !userId) return
  await supabase.from('notification_jobs').upsert(jobs.map((job) => toNotificationRow(job, userId)))
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

async function crawlSourceRow(supabase: DataClient, row: DbRow): Promise<{ source: BbsSource; run: CrawlRun; post: PostRecord | null }> {
  const source = toBbsSource(row)
  const result = await scrapePublicPage(source.url)
  const candidatePost = scrapeResultToPost(result, source.storeId)
  const post = candidatePost ? await savePostRow(supabase, candidatePost) : null
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

  return {
    source: {
      ...source,
      lastFetchedAt: fetchedAt,
      lastStatus: result.status,
      lastMessage: result.message ?? result.title,
    },
    post,
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
  }
}

export async function crawlUserBbsSources(sourceIds?: string[]) {
  const access = await getWriteAccess()
  if (access.mode === 'demo') return { mode: 'demo' as const, results: [], message: access.message }
  assertDatabaseAccess(access)

  let query = access.supabase.from('bbs_sources').select('*').eq('active', true).limit(20)
  if (sourceIds?.length) query = query.in('id', sourceIds)
  const { data, error } = await query
  if (error) throw new RepositoryError(error.message, 400)

  const results = []
  for (const row of data ?? []) {
    results.push(await crawlSourceRow(access.supabase, row))
  }
  return { mode: 'database' as const, results }
}

export async function crawlDueBbsSourcesForCron() {
  const supabase = createSupabaseAdminClient()
  if (!supabase) throw new RepositoryError('Supabase service role env is not configured.', 503)

  const { data, error } = await supabase.from('bbs_sources').select('*').eq('active', true).limit(30)
  if (error) throw new RepositoryError(error.message, 400)

  const now = Date.now()
  const dueRows = (data ?? []).filter((row) => {
    if (!row.last_fetched_at) return true
    const elapsedMinutes = (now - new Date(row.last_fetched_at).getTime()) / 60_000
    return elapsedMinutes >= Number(row.crawl_interval_minutes ?? 360)
  })

  const results = []
  for (const row of dueRows) {
    results.push(await crawlSourceRow(supabase, row))
  }

  return { mode: 'database' as const, checked: data?.length ?? 0, crawled: results.length, results }
}

export async function getCurrentSubscriptionForCheckout() {
  const access = await getWriteAccess()
  if (access.mode !== 'database') return null
  const { data } = await access.supabase.from('subscriptions').select('*').eq('user_id', access.user.id).maybeSingle()
  return { user: access.user, subscription: toSubscription(data) }
}
