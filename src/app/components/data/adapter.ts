import { formatBarName, formatStoreArea, formatStoreSessionLabel } from '@/lib/display'
import type { DashboardState, EventInput, StoreDailyInsight, StoreProfile } from '@/lib/types'
import type { Bar, CalendarEventItem, RuntimeMeta } from './mock'

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

function priceNumber(store: StoreProfile) {
  const note = store.priceNote ?? ''
  const matched = note.match(/([0-9０-９][0-9０-９,，]*)\s*円/)
  if (!matched) return 0
  const normalized = matched[1]
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/[，,]/g, '')
  return Number(normalized) || 0
}

function toBar(
  insight: StoreDailyInsight,
): Bar {
  const point = insight.point
  const store = point.store
  const source = insight.source
  const reliability = insight.reliability
  const storeActivity = insight.activity
  const femaleCount = storeActivity.femalePostCount
  const femaleRatio = storeActivity.womenRatio
  const firstVisitCount = storeActivity.firstVisitCount
  const groupCount = storeActivity.groupVisitCount
  const eventCount = insight.todayEventCount
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

  return {
    id: store.id,
    name: formatBarName(store.name),
    area: formatStoreArea(store.area),
    tags: [
      businessStatusLabel,
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
      `当日営業分の顧客投稿${postCount}件。時刻解析率${storeActivity.timestampCoverage}%、性別判定率${storeActivity.genderCoverage}%です。` +
      (insight.excludedUntimestampedCount > 0
        ? ` 解析保留レコード${insight.excludedUntimestampedCount}件は順位に使用していません。`
        : ''),
    signalCount,
    reason: insight.rankingReason,
    peakHour: hourly.peakHour,
    officialUrl: store.officialUrl,
    bbsUrl: source?.url,
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
    rankingBasisLabel: '当日営業分の顧客投稿数',
    excludedUntimestampedCount: insight.excludedUntimestampedCount,
    genderUnknownCount: Math.max(0, postCount - storeActivity.genderSampleCount),
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
  const sourceEvents = calendarEvents.length ? calendarEvents : state.events
  const bars = state.dailyInsights.map(toBar).toSorted((left, right) => left.rank - right.rank)
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
      postCount: bars.reduce((sum, bar) => sum + bar.postCount, 0),
      recentThreeHourCount,
      eventCount: events.length,
      todayEventCount,
      highConfidenceCount: bars.filter((bar) => bar.dataConfidence >= 80).length,
      normalizedCoverageAverage,
      timestampCoverageAverage,
      rankingMetricLabel: '当日営業分の顧客投稿数',
      businessWindowSummary: bars[0]?.businessWindowLabel ?? '営業時間を確認中',
      excludedUntimestampedCount: bars.reduce((sum, bar) => sum + bar.excludedUntimestampedCount, 0),
      bookmarkCount: state.wordBookmarks.length,
      notificationCount: state.notificationJobs.filter((job) => job.status === 'queued').length,
      planLabel: planLabel(state.subscription.plan),
      modeLabel: modeLabel(state.mode),
      userDisplayName: state.userDisplayName?.trim() || state.userEmail?.split('@')[0] || 'Night Radar ユーザー',
      userEmail: state.userEmail,
      summary: `当日営業分 ${bars.reduce((sum, bar) => sum + bar.postCount, 0)}件 / 直近3時間 ${recentThreeHourCount}件 / 時刻解析率 ${timestampCoverageAverage}%`,
    },
  }
}
