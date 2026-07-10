import { formatBarName, formatStoreArea, formatStoreSessionLabel } from '@/lib/display'
import {
  buildStoreActivityMetrics,
  buildStoreRadarPoints,
  filterPostsForStoreBusinessWindows,
  filterSnapshotsForStoreBusinessWindows,
  inferStoreBusinessWindows,
  type StoreActivityMetrics,
} from '@/lib/scoring'
import type {
  BbsNormalizedPost,
  BbsSource,
  DashboardState,
  EventInput,
  PostRecord,
  StoreProfile,
  StoreRadarPoint,
} from '@/lib/types'
import type { Bar, CalendarEventItem, DataReliability, RuntimeMeta } from './mock'

export type NightRadarViewData = {
  bars: Bar[]
  events: CalendarEventItem[]
  meta: RuntimeMeta
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function validDate(value: string | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function japanDateKey(value: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(validDate(value) ?? new Date())
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(validDate(value) ?? new Date())
}

function statusForSource(source: BbsSource | undefined, referenceAt: string): DataReliability {
  if (!source) return 'unknown'
  if (source.lastStatus === 'blocked' || source.lastStatus === 'failed') return 'blocked'
  if (!source.lastFetchedAt) return 'unknown'

  const reference = validDate(referenceAt)
  const fetched = validDate(source.lastFetchedAt)
  if (!reference || !fetched) return 'unknown'
  return reference.getTime() - fetched.getTime() > 3 * 60 * 60 * 1000 ? 'stale' : 'fresh'
}

function sourceLabel(reliability: DataReliability) {
  if (reliability === 'fresh') return '取得済み'
  if (reliability === 'stale') return '更新古め'
  if (reliability === 'blocked') return '取得不可'
  return '未確認'
}

function sourceUrlForStore(sources: BbsSource[], storeId: string) {
  return sources.find((source) => source.storeId === storeId && source.active)?.url
}

function sourceAgeMinutes(lastSuccessfulAt: string | undefined, referenceAt: string) {
  const reference = validDate(referenceAt)
  const fetched = validDate(lastSuccessfulAt)
  if (!reference || !fetched) return null
  return Math.max(0, Math.round((reference.getTime() - fetched.getTime()) / 60_000))
}

function freshnessLabel(minutes: number | null) {
  if (minutes === null) return '未確認'
  if (minutes < 60) return `${minutes}分前`
  if (minutes < 180) return `${Math.floor(minutes / 60)}時間前`
  return `${Math.floor(minutes / 60)}時間以上前`
}

function confidenceForBar(activity: StoreActivityMetrics, reliability: DataReliability) {
  const sourcePart = reliability === 'fresh' ? 25 : reliability === 'stale' ? 12 : 0
  const normalizedPart = activity.normalizedCoverage * 0.2
  const timestampPart = activity.timestampCoverage * 0.2
  const authorPart = activity.authorCoverage * 0.1
  const genderPart = activity.genderCoverage * 0.15
  const volumePart = Math.min(10, activity.recentPostCount * 2)
  return clamp(sourcePart + normalizedPart + timestampPart + authorPart + genderPart + volumePart)
}

function confidenceLabel(value: number) {
  if (value >= 80) return 'データ信頼度 高'
  if (value >= 60) return 'データ信頼度 中'
  return 'データ信頼度 低'
}

function businessStatus(store: StoreProfile, referenceAt: string, posts: PostRecord[]) {
  const reference = validDate(referenceAt)
  if (!reference) return { active: false, label: '営業時間確認' }
  const windows = inferStoreBusinessWindows(store, referenceAt, posts.map((post) => post.body))
  const referenceTime = reference.getTime()
  const active = windows.some((window) => window.start <= referenceTime && referenceTime <= window.end)
  const basis = windows.some((window) => window.source === 'bbs') ? 'BBS' : windows.some((window) => window.source === 'profile') ? '登録値' : '推定'
  return { active, label: active ? `営業時間内（${basis}）` : `営業時間外（${basis}）` }
}

function priceNumber(store: StoreProfile) {
  const note = store.priceNote ?? ''
  const matched = note.match(/([0-9０-９][0-9０-９,，]*)\s*円/)
  if (!matched) return 0
  const normalized = matched[1]
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/[，,]/g, '')
  return Number(normalized) || 0
}

function eventCountForToday(events: EventInput[], storeId: string, todayKey: string) {
  return events.filter((event) => event.storeId === storeId && event.date === todayKey).length
}

function startHourForStore(store: StoreProfile, referenceAt: string, contextPosts: PostRecord[]) {
  const inferredWindow = inferStoreBusinessWindows(store, referenceAt, contextPosts.map((post) => post.body))[0]
  if (inferredWindow) return inferredWindow.startHour
  const source = store.hasNight ? store.openingHourNight : store.openingHourDay
  const match = source.match(/([01]?\d|2[0-3])[:：](\d{2})/)
  return match ? Number(match[1]) : store.hasNight ? 19 : 13
}

function japanHour(value: string) {
  const date = validDate(value)
  if (!date) return null
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  )
}

function hourlyActivity(store: StoreProfile, posts: PostRecord[], referenceAt: string, contextPosts: PostRecord[]) {
  const startHour = startHourForStore(store, referenceAt, contextPosts)
  const hourLabels = Array.from({ length: 12 }, (_, index) => String((startHour + index) % 24).padStart(2, '0'))
  const hourly = Array.from({ length: hourLabels.length }, () => 0)

  posts.forEach((post) => {
    const hour = japanHour(post.postedAt)
    if (hour === null) return
    const offset = (hour - startHour + 24) % 24
    if (offset < hourly.length) hourly[offset] += 1
  })

  const peakCount = Math.max(...hourly)
  const peakIndex = peakCount > 0 ? hourly.indexOf(peakCount) : 0

  return {
    hourly,
    hourLabels,
    peakHour: `${hourLabels[peakIndex]}:00`,
  }
}

function barReason(args: {
  eventCount: number
  femaleCount: number
  femaleRatio: number | null
  postCount: number
  recentThreeHourCount: number
  confidenceLabel: string
  freshnessLabel: string
}) {
  const reasons = [
    args.postCount > 0 ? `直近営業分 ${args.postCount}件` : '直近営業分は未検出',
    args.recentThreeHourCount > 0 ? `直近3時間 ${args.recentThreeHourCount}件` : '直近3時間は動きなし',
    args.femaleCount > 0 ? `女性書き込み ${args.femaleCount}件` : '女性書き込みは未検出',
    args.femaleRatio === null ? '女性率は母数不足' : `女性率 ${args.femaleRatio}%`,
    args.eventCount > 0 ? `予定 ${args.eventCount}件` : '予定なし',
    `${args.confidenceLabel} / ${args.freshnessLabel}`,
  ]
  return reasons.join(' / ')
}

function toBar(
  point: StoreRadarPoint,
  posts: PostRecord[],
  normalizedPosts: BbsNormalizedPost[],
  businessContextPosts: PostRecord[],
  events: EventInput[],
  sources: BbsSource[],
  todayKey: string,
  generatedAt: string,
): Bar {
  const store = point.store
  const storePosts = posts.filter((post) => post.storeId === store.id)
  const storeContextPosts = businessContextPosts.filter((post) => post.storeId === store.id)
  const source = sources.find((item) => item.storeId === store.id && item.active)
  const reliability = statusForSource(source, generatedAt)
  const storeActivity = buildStoreActivityMetrics({
    storeId: store.id,
    businessPosts: storePosts,
    normalizedPosts,
    referenceAt: generatedAt,
  })
  const femaleCount = storeActivity.femalePostCount
  const femaleRatio = storeActivity.womenRatio
  const firstVisitCount = storeActivity.firstVisitCount
  const groupCount = storeActivity.groupVisitCount
  const eventCount = eventCountForToday(events, store.id, todayKey)
  const postCount = storePosts.length
  const hourly = hourlyActivity(store, storePosts, generatedAt, storeContextPosts)
  const signalCount = storeActivity.attentionPostCount
  const reliabilityLabel = sourceLabel(reliability)
  const ageMinutes = sourceAgeMinutes(point.lastCapturedAt, generatedAt)
  const ageLabel = freshnessLabel(ageMinutes)
  const dataConfidence = confidenceForBar(storeActivity, reliability)
  const dataConfidenceLabel = confidenceLabel(dataConfidence)
  const status = businessStatus(store, generatedAt, storeContextPosts)

  return {
    id: store.id,
    name: formatBarName(store.name),
    area: formatStoreArea(store.area),
    tags: [
      status.label,
      dataConfidenceLabel,
      femaleCount > 0 ? `女性 ${femaleCount}件` : '',
      storeActivity.recentThreeHourCount > 0 ? `直近3時間 ${storeActivity.recentThreeHourCount}件` : '',
      eventCount > 0 ? `予定 ${eventCount}件` : '',
    ].filter(Boolean),
    price: priceNumber(store),
    vibe: clamp((Math.log1p(postCount) / Math.log1p(160)) * 100),
    crowd: clamp((Math.log1p(storeActivity.recentThreeHourCount) / Math.log1p(12)) * 100),
    music: eventCount ? clamp(45 + eventCount * 15) : 0,
    service: dataConfidence,
    drinks: femaleRatio ?? 0,
    score: clamp(point.score),
    trend: hourly.hourly,
    hourly: hourly.hourly,
    hourLabels: hourly.hourLabels,
    note:
      femaleCount > 0
        ? `女性書き込み${femaleCount}件。書き込み時刻の解析率${storeActivity.timestampCoverage}%、性別の判定率${storeActivity.genderCoverage}%です。`
        : `女性の書き込みは未検出です。書き込み時刻の解析率は${storeActivity.timestampCoverage}%です。`,
    signalCount,
    reason: barReason({
      eventCount,
      femaleCount,
      femaleRatio,
      postCount,
      recentThreeHourCount: storeActivity.recentThreeHourCount,
      confidenceLabel: dataConfidenceLabel,
      freshnessLabel: ageLabel,
    }),
    peakHour: hourly.peakHour,
    officialUrl: store.officialUrl,
    bbsUrl: sourceUrlForStore(sources, store.id),
    mapUrl: store.mapUrl,
    phone: store.phone,
    priceNote: store.priceNote,
    sessionLabel: formatStoreSessionLabel(store),
    eventCount,
    femaleCount,
    femaleRatio,
    genderSampleCount: storeActivity.genderSampleCount,
    recentThreeHourCount: storeActivity.recentThreeHourCount,
    recentThreeHourFemaleCount: storeActivity.recentThreeHourFemaleCount,
    firstVisitCount,
    groupCount,
    uniqueAuthorCount: storeActivity.uniqueAuthorCount,
    repeatAuthorRatio: storeActivity.repeatAuthorRatio,
    normalizedCoverage: storeActivity.normalizedCoverage,
    timestampCoverage: storeActivity.timestampCoverage,
    authorCoverage: storeActivity.authorCoverage,
    genderCoverage: storeActivity.genderCoverage,
    dataConfidence,
    dataConfidenceLabel,
    isWithinBusinessHours: status.active,
    businessStatusLabel: status.label,
    freshnessMinutes: ageMinutes,
    freshnessLabel: ageLabel,
    postCount,
    snapshotCount: point.snapshotCount,
    lastCapturedAt: point.lastCapturedAt,
    sourceUpdatedAt: source?.lastFetchedAt,
    reliability,
    reliabilityLabel,
  }
}

function toCalendarEvent(event: EventInput, stores: StoreProfile[]): CalendarEventItem {
  const store = stores.find((item) => item.id === event.storeId)
  const tag = /BINGO|ビンゴ/i.test(event.title)
    ? 'BINGO'
    : /月1|月一|monthly/i.test(event.title)
      ? '月1'
      : /誕生日|birthday|おめでとう/i.test(`${event.title} ${event.details ?? ''}`)
        ? '誕生日'
        : event.session === 'day'
          ? '朝・昼'
          : '夜'

  return {
    id: event.id,
    date: event.date,
    day: Number(event.date.slice(-2)) || 1,
    title: event.title,
    storeName: formatBarName(store?.name ?? '店舗名未確認'),
    tag,
    color: tag === 'BINGO' || tag === '夜' ? '#FF6A5B' : tag === '誕生日' || tag === '月1' ? '#E24A3A' : '#FFB8A8',
    session: event.session,
    sourceUrl: event.sourceUrl,
    startsAt: event.startsAt,
    detail: event.details,
  }
}

function planLabel(plan: DashboardState['subscription']['plan']) {
  if (plan === 'premium') return 'プレミアム'
  if (plan === 'standard') return 'スタンダード'
  if (plan === 'light') return 'ライト'
  return '無料'
}

function modeLabel(mode: DashboardState['mode']) {
  if (mode === 'database') return '最新データ接続中'
  if (mode === 'anonymous') return 'ログイン前'
  return 'デモ表示'
}

export function adaptDashboardToBars(state: DashboardState, calendarEvents: EventInput[] = []): NightRadarViewData {
  const generatedAt = state.setupStatus.generatedAt || new Date().toISOString()
  const todayKey = japanDateKey(generatedAt)
  const businessContextPosts = [...state.posts, ...(state.businessContextPosts ?? [])]
  const confirmedNormalizedIds = new Set(
    state.bbsNormalizedPosts.filter((post) => Boolean(post.postedAt)).map((post) => `normalized-${post.id}`),
  )
  const countablePosts = state.posts.filter((post) => post.source !== 'scrape' || confirmedNormalizedIds.has(post.id))
  const posts = filterPostsForStoreBusinessWindows(countablePosts, state.stores, generatedAt, state.bbsSnapshots, businessContextPosts)
  const snapshots = filterSnapshotsForStoreBusinessWindows(state.bbsSnapshots, state.stores, generatedAt, businessContextPosts)
  const points = buildStoreRadarPoints(state.stores, posts, snapshots)
  const sourceEvents = calendarEvents.length ? calendarEvents : state.events
  const bars = points
    .map((point) => toBar(point, posts, state.bbsNormalizedPosts, businessContextPosts, sourceEvents, state.bbsSources, todayKey, generatedAt))
    .toSorted((left, right) => {
      const femaleDelta = right.femaleCount - left.femaleCount
      if (femaleDelta) return femaleDelta
      const recentDelta = right.recentThreeHourCount - left.recentThreeHourCount
      if (recentDelta) return recentDelta
      const confidenceDelta = right.dataConfidence - left.dataConfidence
      if (confidenceDelta) return confidenceDelta
      const postDelta = right.postCount - left.postCount
      if (postDelta) return postDelta
      return left.name.localeCompare(right.name, 'ja')
    })
  const events = sourceEvents
    .map((event) => toCalendarEvent(event, state.stores))
    .toSorted((left, right) => left.date.localeCompare(right.date) || (left.startsAt ?? '').localeCompare(right.startsAt ?? ''))
  const freshCount = bars.filter((bar) => bar.reliability === 'fresh').length
  const staleCount = bars.filter((bar) => bar.reliability === 'stale' || bar.reliability === 'blocked').length
  const currentMonth = todayKey.slice(0, 7)
  const todayEventCount = events.filter((event) => event.date === todayKey).length
  const recentThreeHourCount = bars.reduce((sum, bar) => sum + bar.recentThreeHourCount, 0)
  const barsWithPosts = bars.filter((bar) => bar.postCount > 0)
  const normalizedCoverageAverage = barsWithPosts.length
    ? clamp(barsWithPosts.reduce((sum, bar) => sum + bar.normalizedCoverage, 0) / barsWithPosts.length)
    : 0
  const timestampCoverageAverage = state.bbsNormalizedPosts.length
    ? clamp((state.bbsNormalizedPosts.filter((post) => Boolean(post.postedAt)).length / state.bbsNormalizedPosts.length) * 100)
    : 0

  return {
    bars,
    events,
    meta: {
      generatedAt,
      generatedAtLabel: formatGeneratedAt(generatedAt),
      todayKey,
      currentMonth,
      currentMonthLabel: currentMonth.replace('-', '.'),
      freshCount,
      staleCount,
      sourceCount: state.bbsSources.filter((source) => source.active).length,
      postCount: posts.length,
      recentThreeHourCount,
      eventCount: events.length,
      todayEventCount,
      highConfidenceCount: bars.filter((bar) => bar.dataConfidence >= 80).length,
      normalizedCoverageAverage,
      timestampCoverageAverage,
      bookmarkCount: state.wordBookmarks.length,
      notificationCount: state.notificationJobs.filter((job) => job.status === 'queued').length,
      planLabel: planLabel(state.subscription.plan),
      modeLabel: modeLabel(state.mode),
      userDisplayName: state.userDisplayName?.trim() || state.userEmail?.split('@')[0] || 'Night Radar ユーザー',
      userEmail: state.userEmail,
      summary: `直近営業分 ${posts.length}件 / 直近3時間 ${recentThreeHourCount}件 / 正規化率 ${normalizedCoverageAverage}%`,
    },
  }
}
