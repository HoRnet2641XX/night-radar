import { formatBarName, formatStoreArea, formatStoreSessionLabel } from '@/lib/display'
import { officialEventCoverageStatus, type OfficialEventCoverageStatus } from '@/lib/official-event-coverage'
import type { PublicDirectoryState } from '@/lib/public-directory'
import { resolvedStoreMapUrl, resolvedStoreOfficialUrl } from '@/lib/store-catalog'
import {
  decisionDateKeyInJapan,
  dedupeNormalizedBbsPosts,
  isStructurallyValidCustomerNormalizedPost,
  resolvedNormalizedPostGender,
} from '@/lib/scoring'
import type { DashboardState, EventInput, StoreDailyInsight, StoreProfile } from '@/lib/types'
import type { Bar, CalendarEventItem, RadarPost, RuntimeMeta, WeeklyMomentumView } from './mock'

export type NightRadarViewData = {
  bars: Bar[]
  events: CalendarEventItem[]
  posts: RadarPost[]
  weeklyMomentum: WeeklyMomentumView
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

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(validDate(value) ?? new Date())
}

function formatWeeklyPeriod(startsAt: string, endsAt: string) {
  const start = validDate(startsAt)
  const end = validDate(endsAt)
  if (!start || !end) return '期間を確認中'

  const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })
  const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  return `${dateFormatter.format(start)} ${timeFormatter.format(start)}〜${dateFormatter.format(end)} ${timeFormatter.format(end)}`
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

function relativeScale(value: number, maximum: number) {
  if (maximum <= 0 || value <= 0) return 0
  return clamp((value / maximum) * 100)
}

type BarScales = {
  posts: number
  recent: number
  events: number
}

function toBar(
  insight: StoreDailyInsight,
  todayEvents: EventInput[] = [],
  scales: BarScales,
  monthEventCoverage: OfficialEventCoverageStatus = 'unverified',
): Bar {
  const point = insight.point
  const store = point.store
  const source = insight.source
  const reliability = insight.reliability
  const storeActivity = insight.activity
  const femaleCount = storeActivity.femalePostCount
  const maleCount = storeActivity.malePostCount
  const coupleCount = storeActivity.couplePostCount
  const femaleRatio = storeActivity.womenRatio
  const firstVisitCount = storeActivity.firstVisitCount
  const groupCount = storeActivity.groupVisitCount
  const eventCount = insight.todayEventCount
  const eventStatus = eventCount > 0
    ? 'scheduled'
    : monthEventCoverage === 'external'
      ? 'external'
      : monthEventCoverage === 'unverified'
        ? 'unverified'
        : 'none'
  const postCount = storeActivity.recentPostCount
  const hourly = {
    hourly: insight.hourlyCounts,
    hourLabels: insight.hourLabels,
    peakHour: insight.peakHour,
  }
  const signalCount = storeActivity.attentionPostCount
  const reliabilityLabel = insight.reliabilityLabel
  const ageMinutes = insight.freshnessMinutes
  const ageLabel = insight.freshnessLabel
  const dataConfidence = insight.dataConfidence
  const dataConfidenceLabel = insight.dataConfidenceLabel
  const businessStatusLabel = insight.isOpenNow ? '営業時間内' : '営業時間外'
  const area = formatStoreArea(store.area)
  const formattedName = formatBarName(store.name)
  const officialUrl = resolvedStoreOfficialUrl(store, source?.url)
  const mapUrl = resolvedStoreMapUrl(store)

  return {
    id: store.id,
    name: formattedName,
    area,
    address: store.address,
    nearestStation: store.nearestStation,
    tags: [
      businessStatusLabel,
      dataConfidenceLabel,
      femaleCount > 0 ? `女性 ${femaleCount}件` : '',
      storeActivity.recentThreeHourCount > 0 ? `直近3時間 ${storeActivity.recentThreeHourCount}件` : '',
      eventStatus === 'scheduled'
        ? `予定 ${eventCount}件`
        : eventStatus === 'external'
          ? '予定 公式で確認'
          : eventStatus === 'unverified'
            ? '予定 未確認'
            : '本日の予定なし',
    ].filter(Boolean),
    searchKeywords: [
      store.name,
      formattedName,
      area,
      store.address,
      store.nearestStation,
      store.priceNote,
      store.prStructure,
      ...store.tags,
      ...store.strongDays,
      ...store.strongEvents,
      ...todayEvents.map((event) => event.title),
    ].filter((value): value is string => Boolean(value?.trim())),
    price: priceNumber(store),
    vibe: relativeScale(postCount, scales.posts),
    crowd: relativeScale(storeActivity.recentThreeHourCount, scales.recent),
    music: relativeScale(eventCount, scales.events),
    service: dataConfidence,
    drinks: femaleRatio ?? 0,
    score: clamp(point.score),
    trend: hourly.hourly,
    hourly: hourly.hourly,
    hourLabels: hourly.hourLabels,
    note:
      `当日顧客投稿${postCount}件。時刻解析率${storeActivity.timestampCoverage}%、性別判定率${storeActivity.genderCoverage}%です。` +
      (insight.excludedUntimestampedCount > 0
        ? ` 解析保留レコード${insight.excludedUntimestampedCount}件は順位に使用していません。`
        : ''),
    signalCount,
    reason: insight.rankingReason,
    peakHour: hourly.peakHour,
    officialUrl,
    bbsUrl: source?.url,
    mapUrl,
    phone: store.phone,
    priceNote: store.priceNote,
    sessionLabel: formatStoreSessionLabel(store),
    eventCount,
    eventStatus,
    femaleCount,
    maleCount,
    coupleCount,
    femaleRatio,
    genderSampleCount: storeActivity.genderSampleCount,
    recentThreeHourCount: storeActivity.recentThreeHourCount,
    recentThreeHourFemaleCount: storeActivity.recentThreeHourFemaleCount,
    firstVisitCount,
    groupCount,
    uniqueAuthorCount: storeActivity.uniqueAuthorCount,
    estimatedVisitIntentCount: storeActivity.estimatedVisitIntentCount,
    maleVisitIntentCount: storeActivity.maleVisitIntentCount,
    femaleVisitIntentCount: storeActivity.femaleVisitIntentCount,
    coupleVisitIntentCount: storeActivity.coupleVisitIntentCount,
    unknownVisitIntentCount: storeActivity.unknownVisitIntentCount,
    repeatPostCount: storeActivity.repeatPostCount,
    repeatAuthorRatio: storeActivity.repeatAuthorRatio,
    normalizedCoverage: storeActivity.normalizedCoverage,
    timestampCoverage: storeActivity.timestampCoverage,
    authorCoverage: storeActivity.authorCoverage,
    genderCoverage: storeActivity.genderCoverage,
    dataConfidence,
    dataConfidenceLabel,
    isWithinBusinessHours: insight.isOpenNow,
    businessStatusLabel,
    businessWindowLabel: insight.businessWindowLabel,
    freshnessMinutes: ageMinutes,
    freshnessLabel: ageLabel,
    postCount,
    snapshotCount: point.snapshotCount,
    lastCapturedAt: insight.lastSuccessfulAt,
    sourceUpdatedAt: insight.lastAttemptAt,
    reliability,
    reliabilityLabel,
    rank: insight.rank,
    rankingBasisLabel: '当日顧客投稿数',
    excludedUntimestampedCount: insight.excludedUntimestampedCount,
    genderUnknownCount: Math.max(0, postCount - storeActivity.genderSampleCount - storeActivity.couplePostCount),
    genderStatus:
      storeActivity.genderSampleCount === 0 || storeActivity.genderCoverage < 20
        ? 'unavailable'
        : storeActivity.genderCoverage < 60
          ? 'partial'
          : 'measured',
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
    storeId: event.storeId,
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

export function adaptEventsToCalendar(events: EventInput[], stores: StoreProfile[]) {
  return events
    .map((event) => toCalendarEvent(event, stores))
    .toSorted((left, right) => left.date.localeCompare(right.date) || (left.startsAt ?? '').localeCompare(right.startsAt ?? ''))
}


function cleanPostBody(value: string) {
  return value
    .replace(/^\[\[NR_TARGET_DATE:\d{4}-\d{2}-\d{2}\]\]\s*/u, '')
    .replace(/^投稿者[:：]\s*[^（(\n]{1,80}[（(](?:女性|女|単女|単独女性|男性|男|単男|単独男性|カップル|夫婦|ペア|複数|♀|♂)[）)]\s*/u, '')
    .trim()
}

function formatPostTime(value: string | undefined, fallback: string) {
  const date = validDate(value) ?? validDate(fallback)
  if (!date) return '時刻未確認'
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function adaptNormalizedPostsToRadar(
  normalizedPosts: DashboardState['bbsNormalizedPosts'],
  stores: StoreProfile[],
  dailyInsights: StoreDailyInsight[],
): RadarPost[] {
  const storeNames = new Map(stores.map((store) => [store.id, formatBarName(store.name)]))
  const currentPostIds = new Set(dailyInsights.flatMap((insight) => insight.rankingPostIds))

  return dedupeNormalizedBbsPosts(normalizedPosts)
    .filter(isStructurallyValidCustomerNormalizedPost)
    .map((post) => {
      const gender = resolvedNormalizedPostGender(post)
      const body = cleanPostBody(post.body)
      return {
        id: post.id,
        storeId: post.storeId,
        storeName: storeNames.get(post.storeId) ?? '店舗名未確認',
        authorName: post.authorName.trim() || '記載なし',
        gender,
        genderLabel: gender === 'female' ? '女性' : gender === 'male' ? '男性' : gender === 'couple' ? 'カップル' : '区分未記載',
        postedAt: post.postedAt,
        postedAtLabel: formatPostTime(post.postedAt, post.observedAt),
        body,
        sourceUrl: post.sourceUrl,
        isCurrentBusinessDay: currentPostIds.has(`normalized-${post.id}`),
        hasEmoji: /\p{Extended_Pictographic}/u.test(`${post.authorName} ${body}`),
      } satisfies RadarPost
    })
    .toSorted((left, right) => new Date(right.postedAt ?? 0).getTime() - new Date(left.postedAt ?? 0).getTime())
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
  if (mode === 'unavailable') return 'データ更新停止'
  return 'デモ表示'
}

export function adaptDashboardToBars(state: DashboardState, calendarEvents: EventInput[] = []): NightRadarViewData {
  const generatedAt = state.setupStatus.generatedAt || new Date().toISOString()
  const todayKey = decisionDateKeyInJapan(generatedAt) ?? new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(validDate(generatedAt) ?? new Date())
  const currentMonth = todayKey.slice(0, 7)
  const sourceEvents = calendarEvents.length ? calendarEvents : state.events
  const eventCoverageByStore = new Map(
    state.stores.map((store) => [
      store.id,
      officialEventCoverageStatus(store.id, currentMonth, sourceEvents),
    ]),
  )
  const scales: BarScales = {
    posts: Math.max(1, ...state.dailyInsights.map((insight) => insight.activity.recentPostCount)),
    recent: Math.max(1, ...state.dailyInsights.map((insight) => insight.activity.recentThreeHourCount)),
    events: Math.max(1, ...state.dailyInsights.map((insight) => insight.todayEventCount)),
  }
  const bars = state.dailyInsights
    .map((insight) => toBar(
      insight,
      sourceEvents.filter((event) => event.storeId === insight.store.id && event.date === todayKey),
      scales,
      eventCoverageByStore.get(insight.store.id),
    ))
    .toSorted((left, right) => left.rank - right.rank)
  const events = adaptEventsToCalendar(sourceEvents, state.stores)
  const freshCount = bars.filter((bar) => bar.reliability === 'fresh').length
  const staleCount = bars.filter((bar) => bar.reliability === 'stale' || bar.reliability === 'blocked').length
  const todayEventCount = events.filter((event) => event.date === todayKey).length
  const recentThreeHourCount = bars.reduce((sum, bar) => sum + bar.recentThreeHourCount, 0)
  const barsWithPosts = bars.filter((bar) => bar.postCount > 0)
  const normalizedCoverageAverage = barsWithPosts.length
    ? clamp(barsWithPosts.reduce((sum, bar) => sum + bar.normalizedCoverage, 0) / barsWithPosts.length)
    : 0
  const timestampCoverageAverage = state.bbsNormalizedPosts.length
    ? clamp((state.bbsNormalizedPosts.filter((post) => Boolean(post.postedAt)).length / state.bbsNormalizedPosts.length) * 100)
    : 0
  const posts = adaptNormalizedPostsToRadar(state.bbsNormalizedPosts, state.stores, state.dailyInsights)

  return {
    bars,
    events,
    posts,
    weeklyMomentum: {
      currentPeriodLabel: '今週の同期間',
      previousPeriodLabel: '先週の同期間',
      comparisonDayCount: 1,
      minimumComparisonCount: 3,
      measuredStoreCount: 0,
      newActivityStoreCount: 0,
      ranking: [],
    },
    meta: {
      generatedAt,
      generatedAtLabel: formatGeneratedAt(generatedAt),
      todayKey,
      currentMonth,
      currentMonthLabel: currentMonth.replace('-', '.'),
      freshCount,
      staleCount,
      sourceCount: state.bbsSources.filter((source) => source.active).length,
      postCount: bars.reduce((sum, bar) => sum + bar.postCount, 0),
      recentThreeHourCount,
      eventCount: events.filter((event) => event.date.startsWith(currentMonth)).length,
      todayEventCount,
      eventCoverageStoreCount: [...eventCoverageByStore.values()].filter((status) => status !== 'unverified').length,
      eventUnverifiedStoreCount: [...eventCoverageByStore.values()].filter((status) => status === 'unverified').length,
      highConfidenceCount: bars.filter((bar) => bar.dataConfidence >= 80).length,
      normalizedCoverageAverage,
      timestampCoverageAverage,
      rankingMetricLabel: '当日顧客投稿数',
      businessWindowSummary: bars[0]?.businessWindowLabel ?? '営業時間を確認中',
      excludedUntimestampedCount: bars.reduce((sum, bar) => sum + bar.excludedUntimestampedCount, 0),
      bookmarkCount: state.wordBookmarks.length,
      notificationCount: state.notificationJobs.filter((job) => job.status === 'queued').length,
      planLabel: planLabel(state.subscription.plan),
      modeLabel: modeLabel(state.mode),
      userDisplayName: state.userDisplayName?.trim() || state.userEmail?.split('@')[0] || 'Night Radar ユーザー',
      userEmail: state.userEmail,
      authenticated: Boolean(state.userId),
      summary: `当日顧客投稿 ${bars.reduce((sum, bar) => sum + bar.postCount, 0)}件 / 直近3時間 ${recentThreeHourCount}件 / 時刻解析率 ${timestampCoverageAverage}%`,
    },
  }
}

export function adaptPublicDirectoryToBars(
  state: PublicDirectoryState,
  calendarEvents: EventInput[] = [],
): NightRadarViewData {
  const data = adaptDashboardToBars({
    mode: state.mode,
    connectionNote: state.connectionNote,
    setupStatus: {
      generatedAt: state.generatedAt,
      actionCount: 0,
      checkCount: 0,
      items: [],
    },
    stores: state.stores,
    events: state.events,
    posts: [],
    scoredEvents: [],
    situations: [],
    bbsSources: state.sources,
    crawlRuns: [],
    bbsSnapshots: [],
    bbsNormalizedPosts: state.normalizedPosts,
    dailyInsights: state.dailyInsights,
    storeDecisions: {},
    exactTerms: { popularSingleMale: '', popularSingleFemale: '', negativePerson: '' },
    wordBookmarks: [],
    notificationJobs: [],
    notificationPreference: { email: '', webhookUrl: '', channel: 'in_app', audience: 'free' },
    importBatches: [],
    subscription: { plan: 'free', status: 'public' },
    wordCategories: [],
  }, calendarEvents)
  const namesByStore = new Map(data.bars.map((bar) => [bar.id, bar.name]))
  const weeklyMomentum: WeeklyMomentumView = {
    currentPeriodLabel: formatWeeklyPeriod(
      state.weeklyMomentum.currentStartsAt,
      state.weeklyMomentum.currentEndsAt,
    ),
    previousPeriodLabel: formatWeeklyPeriod(
      state.weeklyMomentum.previousStartsAt,
      state.weeklyMomentum.previousEndsAt,
    ),
    comparisonDayCount: state.weeklyMomentum.comparisonDayCount,
    minimumComparisonCount: state.weeklyMomentum.minimumComparisonCount,
    measuredStoreCount: state.weeklyMomentum.measuredStoreCount,
    newActivityStoreCount: state.weeklyMomentum.newActivityStoreCount,
    ranking: state.weeklyMomentum.stores
      .filter((store) => store.rank !== null && store.weekOverWeekRatio !== null && store.changePercent !== null)
      .toSorted((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
      .map((store) => ({
        storeId: store.storeId,
        storeName: namesByStore.get(store.storeId) ?? '店舗名未確認',
        currentPostCount: store.currentPostCount,
        previousPostCount: store.previousPostCount,
        postDelta: store.postDelta,
        momentumPercent: store.momentumPercent ?? 0,
        weekOverWeekRatio: store.weekOverWeekRatio ?? 0,
        changePercent: store.changePercent ?? 0,
        rank: store.rank ?? 0,
      })),
  }

  return { ...data, weeklyMomentum }
}
