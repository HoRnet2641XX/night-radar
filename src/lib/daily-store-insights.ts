import {
  buildEffectiveBbsPostRecords,
  buildStoreActivityMetrics,
  buildStoreRadarPoints,
  decisionDateKeyInJapan,
  filterPostsForDecisionDate,
  filterSnapshotsForBusinessDay,
  inferStoreBusinessWindows,
  isStructurallyValidCustomerNormalizedPost,
} from './scoring'
import type {
  BbsNormalizedPost,
  BbsSnapshot,
  BbsSource,
  EventInput,
  PostRecord,
  SignalTone,
  StoreDailyInsight,
  StoreDataReliability,
  StoreProfile,
  StoreRadarPoint,
} from './types'

export const DAILY_INSIGHT_CONTRACT_VERSION = '2026-07-13.2'

export type DailyStoreDataset = {
  generatedAt: string
  todayKey: string
  effectivePosts: PostRecord[]
  businessPosts: PostRecord[]
  businessSnapshots: BbsSnapshot[]
  insights: StoreDailyInsight[]
}

type BuildDailyStoreDatasetInput = {
  stores: StoreProfile[]
  events: EventInput[]
  rawPosts: PostRecord[]
  sources: BbsSource[]
  snapshots: BbsSnapshot[]
  normalizedPosts: BbsNormalizedPost[]
  businessContextPosts?: PostRecord[]
  referenceAt?: string
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function validTime(value?: string) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function observedWithinHours(value: string, referenceAt: string, hours: number) {
  const observed = validTime(value)
  const reference = validTime(referenceAt)
  if (observed === null || reference === null) return false
  return observed >= reference - hours * 60 * 60 * 1000 && observed <= reference + 10 * 60 * 1000
}

function latestDate(values: Array<string | undefined>, referenceAt: string) {
  const futureTolerance = new Date(referenceAt).getTime() + 10 * 60_000
  const latest = values.reduce((max, value) => {
    const time = validTime(value)
    return time !== null && time <= futureTolerance ? Math.max(max, time) : max
  }, 0)
  return latest ? new Date(latest).toISOString() : undefined
}

function japanDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function upcomingJapanDateKeys(baseDateKey: string, days = 7) {
  const [year, month, day] = baseDateKey.split('-').map(Number)
  const reference = new Date(Date.UTC(year, month - 1, day, 12))
  return new Set(
    Array.from({ length: days }, (_, index) => japanDateKey(new Date(reference.getTime() + index * 24 * 60 * 60 * 1000))),
  )
}

function eventDateKey(event: EventInput, todayKey: string) {
  if (event.date === '今日') return todayKey
  return /^\d{4}-\d{2}-\d{2}$/.test(event.date) ? event.date : null
}

function sourceForStore(sources: BbsSource[], storeId: string) {
  return sources
    .filter((source) => source.storeId === storeId && source.active)
    .toSorted((left, right) => (validTime(right.lastFetchedAt) ?? 0) - (validTime(left.lastFetchedAt) ?? 0))[0]
}

function freshnessMinutes(value: string | undefined, referenceAt: string) {
  const captured = validTime(value)
  const reference = validTime(referenceAt)
  if (captured === null || reference === null) return null
  return Math.max(0, Math.round((reference - captured) / 60_000))
}

function freshnessLabel(minutes: number | null) {
  if (minutes === null) return '更新時刻を確認中'
  if (minutes < 60) return `${minutes}分前`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}時間前`
  return `${Math.floor(minutes / (24 * 60))}日前`
}

function reliabilityForSource(source: BbsSource | undefined, lastSuccessfulAt: string | undefined, referenceAt: string) {
  const ageMinutes = freshnessMinutes(lastSuccessfulAt, referenceAt)
  if (!source) return { reliability: 'unknown' as const, label: '巡回元未登録', ageMinutes }
  if (source.lastStatus === 'blocked' || source.lastStatus === 'failed') {
    return {
      reliability: 'blocked' as const,
      label: lastSuccessfulAt ? '最新取得に失敗・直前データを使用' : '取得不可',
      ageMinutes,
    }
  }
  if (ageMinutes === null) return { reliability: 'unknown' as const, label: '取得時刻を確認中', ageMinutes }

  const staleAfterMinutes = Math.max(45, Math.min(180, source.crawlIntervalMinutes * 3))
  if (ageMinutes > staleAfterMinutes) return { reliability: 'stale' as const, label: '更新が古い', ageMinutes }
  return { reliability: 'fresh' as const, label: '取得良好', ageMinutes }
}

function confidenceForInsight(args: {
  reliability: StoreDataReliability
  normalizedCoverage: number
  timestampCoverage: number
  postCount: number
}) {
  const sourcePart = args.reliability === 'fresh' ? 30 : args.reliability === 'stale' ? 18 : args.reliability === 'blocked' ? 8 : 0
  const normalizedPart = args.normalizedCoverage * 0.2
  const timestampPart = args.timestampCoverage * 0.35
  const volumePart = args.postCount > 0 ? Math.min(15, 5 + args.postCount * 1.25) : 0
  return clamp(sourcePart + normalizedPart + timestampPart + volumePart)
}

function confidenceLabel(value: number) {
  if (value >= 80) return '集計信頼度 高'
  if (value >= 60) return '集計信頼度 中'
  if (value >= 40) return '集計信頼度 要確認'
  return '集計信頼度 低'
}

function genderConfidence(genderCoverage: number, sampleCount: number) {
  if (!sampleCount) return 0
  return clamp(genderCoverage * 0.75 + Math.min(25, sampleCount * 5))
}

function sourceLabel(source: 'bbs' | 'profile' | 'fallback') {
  if (source === 'bbs') return 'BBS記載'
  if (source === 'profile') return '登録営業時間'
  return '標準営業時間'
}

function formatWindowDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))
}

function formatWindowTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))
}

function japanHour(value: string) {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value)),
  )
}

function buildHourlyActivity(posts: PostRecord[], windows: StoreDailyInsight['businessWindows']) {
  const startHour = windows[0] ? japanHour(windows[0].startsAt) : 19
  const hourLabels = Array.from({ length: 12 }, (_, index) => String((startHour + index) % 24).padStart(2, '0'))
  const hourlyCounts = Array.from({ length: hourLabels.length }, () => 0)

  posts.forEach((post) => {
    const hour = japanHour(post.postedAt)
    const offset = (hour - startHour + 24) % 24
    if (offset < hourlyCounts.length) hourlyCounts[offset] += 1
  })

  const maxCount = Math.max(0, ...hourlyCounts)
  const peakIndex = maxCount > 0 ? hourlyCounts.indexOf(maxCount) : 0
  return {
    hourlyCounts,
    hourLabels,
    peakHour: maxCount > 0 ? `${hourLabels[peakIndex]}:00` : '未判定',
  }
}

function businessWindowLabel(windows: StoreDailyInsight['businessWindows']) {
  if (!windows.length) return '営業時間を確認中'
  return windows
    .map((window) => {
      const startDate = formatWindowDate(window.startsAt)
      const endDate = formatWindowDate(window.endsAt)
      const endPrefix = startDate === endDate ? '' : '翌'
      return `${startDate} ${window.label} ${formatWindowTime(window.startsAt)}-${endPrefix}${formatWindowTime(window.endsAt)}（${sourceLabel(window.source)}）`
    })
    .join(' / ')
}

function normalizedRatio(value: number, max: number) {
  if (value <= 0 || max <= 0) return 0
  return Math.log1p(value) / Math.log1p(max)
}

function toneForScore(score: number): SignalTone {
  if (score >= 76) return 'hot'
  if (score >= 48) return 'warm'
  return 'quiet'
}

function verdictForScore(score: number) {
  if (score >= 76) return '投稿の動きが強い'
  if (score >= 48) return '比較候補'
  return '追加観測'
}

function compareDailyInsights(left: StoreDailyInsight, right: StoreDailyInsight) {
  return (
    right.activity.recentPostCount - left.activity.recentPostCount ||
    right.activity.recentThreeHourCount - left.activity.recentThreeHourCount ||
    right.dataConfidence - left.dataConfidence ||
    right.heatScore - left.heatScore ||
    left.store.name.localeCompare(right.store.name, 'ja')
  )
}

export function rankDailyStoreInsights(insights: StoreDailyInsight[]) {
  const ranked = [...insights].toSorted(compareDailyInsights)
  const totalPosts = ranked.reduce((sum, insight) => sum + insight.activity.recentPostCount, 0)

  return ranked.map((insight, index) => ({
    ...insight,
    rank: index + 1,
    point: {
      ...insight.point,
      rank: index + 1,
      score: insight.heatScore,
      tone: toneForScore(insight.heatScore),
      verdict: verdictForScore(insight.heatScore),
      postCount: insight.activity.recentPostCount,
      share: totalPosts ? clamp((insight.activity.recentPostCount / totalPosts) * 100) : 0,
    },
  }))
}

export function buildDailyStoreDataset(input: BuildDailyStoreDatasetInput): DailyStoreDataset {
  const generatedAt = input.referenceAt ?? new Date().toISOString()
  const referenceTime = validTime(generatedAt) ?? Date.now()
  const todayKey = decisionDateKeyInJapan(generatedAt) ?? japanDateKey(generatedAt)
  const upcomingKeys = upcomingJapanDateKeys(todayKey)
  const effectivePosts = buildEffectiveBbsPostRecords(input.rawPosts, input.normalizedPosts)
  const businessContextPosts = input.businessContextPosts ?? []
  const businessPosts = filterPostsForDecisionDate(effectivePosts, generatedAt)
  const businessSnapshots = filterSnapshotsForBusinessDay(input.snapshots, generatedAt)
  const basePoints = buildStoreRadarPoints(input.stores, businessPosts, businessSnapshots)

  const drafts = input.stores.map((store) => {
    const source = sourceForStore(input.sources, store.id)
    const posts = businessPosts.filter((post) => post.storeId === store.id)
    const allStoreSnapshots = input.snapshots.filter((snapshot) => snapshot.storeId === store.id)
    const normalizedPosts = input.normalizedPosts.filter((post) => post.storeId === store.id)
    const events = input.events.filter((event) => event.storeId === store.id)
    const contextTexts = businessContextPosts.filter((post) => post.storeId === store.id).map((post) => post.body)
    const windows = inferStoreBusinessWindows(store, generatedAt, contextTexts).map((window) => ({
      label: window.label,
      startsAt: new Date(window.start).toISOString(),
      endsAt: new Date(window.end).toISOString(),
      source: window.source,
      active: window.start <= referenceTime && referenceTime <= window.end,
    }))
    const activity = buildStoreActivityMetrics({
      storeId: store.id,
      businessPosts,
      normalizedPosts: input.normalizedPosts,
      referenceAt: generatedAt,
    })
    const hourly = buildHourlyActivity(posts, windows)
    const lastSuccessfulAt = latestDate(
      [
        ...allStoreSnapshots.map((snapshot) => snapshot.capturedAt),
        ...normalizedPosts.map((post) => post.observedAt),
      ],
      generatedAt,
    )
    const sourceState = reliabilityForSource(source, lastSuccessfulAt, generatedAt)
    const dataConfidence = confidenceForInsight({
      reliability: sourceState.reliability,
      normalizedCoverage: activity.normalizedCoverage,
      timestampCoverage: activity.timestampCoverage,
      postCount: activity.recentPostCount,
    })
    const storeTodayEvents = events.filter((event) => eventDateKey(event, todayKey) === todayKey)
    const upcomingEvents = events.filter((event) => {
      const key = eventDateKey(event, todayKey)
      return key ? upcomingKeys.has(key) : false
    })
    const weekendEvents = upcomingEvents.filter((event) => /金|土|日/.test(event.weekday))
    const point =
      basePoints.find((item) => item.store.id === store.id) ??
      ({
        store,
        score: 0,
        tone: 'quiet',
        share: 0,
        rank: 0,
        postCount: 0,
        snapshotCount: 0,
        signals: { femaleOnly: 0, firstVisit: 0, comeback: 0, groupVisit: 0, emoji: 0, totalSignals: 0, textLength: 0 },
        verdict: '追加観測',
      } satisfies StoreRadarPoint)

    return {
      generatedAt,
      store,
      point,
      source,
      activity,
      rankingPostIds: posts.map((post) => post.id),
      hourlyCounts: hourly.hourlyCounts,
      hourLabels: hourly.hourLabels,
      peakHour: hourly.peakHour,
      businessWindows: windows,
      businessWindowLabel: businessWindowLabel(windows),
      isOpenNow: windows.some((window) => window.active),
      todayEventCount: storeTodayEvents.length,
      upcomingEventCount: upcomingEvents.length,
      weekendEventCount: weekendEvents.length,
      heatScore: 0,
      rank: 0,
      rankingBasis: 'decision_date_customer_posts' as const,
      rankingReason: '',
      reliability: sourceState.reliability,
      reliabilityLabel: sourceState.label,
      lastSuccessfulAt,
      lastAttemptAt: source?.lastFetchedAt,
      freshnessMinutes: sourceState.ageMinutes,
      freshnessLabel: freshnessLabel(sourceState.ageMinutes),
      dataConfidence,
      dataConfidenceLabel: confidenceLabel(dataConfidence),
      genderConfidence: genderConfidence(activity.genderCoverage, activity.genderSampleCount),
      excludedUntimestampedCount: normalizedPosts.filter(
        (post) =>
          !post.postedAt &&
          observedWithinHours(post.observedAt, generatedAt, 6) &&
          isStructurallyValidCustomerNormalizedPost(post),
      ).length,
    } satisfies StoreDailyInsight
  })

  const maxPosts = Math.max(0, ...drafts.map((insight) => insight.activity.recentPostCount))
  const maxRecentPosts = Math.max(0, ...drafts.map((insight) => insight.activity.recentThreeHourCount))
  const maxAttention = Math.max(0, ...drafts.map((insight) => insight.activity.attentionPostCount))

  const scored = drafts.map((insight) => {
    const volumeScore = normalizedRatio(insight.activity.recentPostCount, maxPosts) * 58
    const recentScore = normalizedRatio(insight.activity.recentThreeHourCount, maxRecentPosts) * 24
    const attentionScore = normalizedRatio(insight.activity.attentionPostCount, maxAttention) * 8
    const eventScore = Math.min(5, insight.todayEventCount * 3)
    const freshnessScore = insight.reliability === 'fresh' ? 5 : insight.reliability === 'stale' ? 2 : 0
    const heatScore = clamp(volumeScore + recentScore + attentionScore + eventScore + freshnessScore)
    const genderBasis = insight.activity.genderSampleCount
      ? `性別判定 ${insight.activity.genderSampleCount}/${insight.activity.recentPostCount}件`
      : '性別は判定材料に不使用'

    return {
      ...insight,
      heatScore,
      rankingReason: `当日顧客投稿 ${insight.activity.recentPostCount}件 / 直近3時間 ${insight.activity.recentThreeHourCount}件 / ${genderBasis} / ${insight.dataConfidenceLabel}`,
    }
  })

  return {
    generatedAt,
    todayKey,
    effectivePosts,
    businessPosts,
    businessSnapshots,
    insights: rankDailyStoreInsights(scored),
  }
}
