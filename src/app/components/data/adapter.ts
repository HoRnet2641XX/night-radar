import { formatBarName, formatStoreArea, formatStoreSessionLabel } from '@/lib/display'
import { resolvedStoreMapUrl, resolvedStoreOfficialUrl } from '@/lib/store-catalog'
import { isStructurallyValidCustomerNormalizedPost, resolvedNormalizedPostGender } from '@/lib/scoring'
import type { DashboardState, EventInput, StoreDailyInsight, StoreProfile } from '@/lib/types'
import type { Bar, CalendarEventItem, RadarPost, RuntimeMeta } from './mock'

export type NightRadarViewData = {
  bars: Bar[]
  events: CalendarEventItem[]
  posts: RadarPost[]
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
      eventCount > 0 ? `予定 ${eventCount}件` : '',
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
    rankingBasisLabel: '当日顧客投稿数',
    excludedUntimestampedCount: insight.excludedUntimestampedCount,
    genderUnknownCount: Math.max(0, postCount - storeActivity.genderSampleCount),
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


function cleanPostBody(value: string) {
  return value
    .replace(/^\[\[NR_TARGET_DATE:\d{4}-\d{2}-\d{2}\]\]\s*/u, '')
    .replace(/^投稿者[:：]\s*[^（(\n]{1,80}[（(](?:女性|女|単女|単独女性|男性|男|単男|単独男性|♀|♂)[）)]\s*/u, '')
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

function toRadarPosts(state: DashboardState, bars: Bar[]): RadarPost[] {
  const storeNames = new Map(bars.map((bar) => [bar.id, bar.name]))
  const currentPostIds = new Set(state.dailyInsights.flatMap((insight) => insight.rankingPostIds))
  const seen = new Set<string>()

  return state.bbsNormalizedPosts
    .filter(isStructurallyValidCustomerNormalizedPost)
    .filter((post) => {
      const key = [
        post.storeId,
        post.authorName.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ja-JP'),
        post.postedAt?.slice(0, 16) ?? 'time-unknown',
        cleanPostBody(post.body).normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ja-JP'),
      ].join(':')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((post) => {
      const gender = resolvedNormalizedPostGender(post)
      const body = cleanPostBody(post.body)
      return {
        id: post.id,
        storeId: post.storeId,
        storeName: storeNames.get(post.storeId) ?? '店舗名未確認',
        authorName: post.authorName.trim() || '記載なし',
        gender,
        genderLabel: gender === 'female' ? '女性' : gender === 'male' ? '男性' : '性別未記載',
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
  return 'デモ表示'
}

export function adaptDashboardToBars(state: DashboardState, calendarEvents: EventInput[] = []): NightRadarViewData {
  const generatedAt = state.setupStatus.generatedAt || new Date().toISOString()
  const todayKey = japanDateKey(generatedAt)
  const sourceEvents = calendarEvents.length ? calendarEvents : state.events
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
    ))
    .toSorted((left, right) => left.rank - right.rank)
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
  const posts = toRadarPosts(state, bars)

  return {
    bars,
    events,
    posts,
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
