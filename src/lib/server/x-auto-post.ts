import { createHash } from 'node:crypto'
import { Client, OAuth1 } from '@xdevplatform/xdk'
import { formatHeatLabel } from '@/lib/heat-labels'
import { formatPublicStoreName, type PublicDirectoryState, type PublicStoreSummary } from '@/lib/public-directory'
import { isExplicitVisitIntentBody, isRankableCustomerNormalizedPost, postDecisionDateKeyForStore } from '@/lib/scoring'
import type { PostRecord } from '@/lib/types'

const DEFAULT_TARGET_URL = 'https://night-radar.vercel.app/share'
const X_MAX_WEIGHTED_LENGTH = 280
const X_SAFE_WEIGHTED_LENGTH = X_MAX_WEIGHTED_LENGTH
const X_TRANSFORMED_URL_LENGTH = 23
const medalByRank = ['🥇', '🥈', '🥉'] as const

export const xAutoPostSlots = ['midday', 'evening', 'tomorrow'] as const
export type XAutoPostSlot = (typeof xAutoPostSlots)[number]
export type XAutoPostKind = 'today_ranking' | 'weekly_momentum' | 'tomorrow_forecast'

const memoTitlesBySlot: Record<XAutoPostSlot, readonly string[]> = {
  midday: [
    '🌪️夜速報',
    '📡昼速報',
    '🍸店選び',
  ],
  evening: [
    '🔥夜速報',
    '🌪️途中経過',
    '📡夜動向',
  ],
  tomorrow: [
    '🔮明日予報',
    '🌙明日候補',
    '📅明日速報',
  ],
}

export type XAutoPostConfig = {
  enabled: boolean
  credentialsConfigured: boolean
  includeUrl: boolean
  targetUrl: string
  minimumDataConfidence: number
}

export type XDailyCandidate = {
  rank: number
  storeId: string
  storeName: string
  postCount: number
  recentThreeHourCount: number
  dataConfidence: number
  heatLabel: string
  detail: string
}

export type XEventHighlight = {
  storeId: string
  storeName: string
  title: string | null
}

export type XDailyPostPlan = {
  idempotencyKey: string
  slot: XAutoPostSlot
  kind: XAutoPostKind
  targetDateKey: string
  scheduledFor: string
  sourceGeneratedAt: string
  text: string
  replyTexts: string[]
  threadTexts: string[]
  weightedLength: number
  weightedLengths: number[]
  contentHash: string
  candidates: XDailyCandidate[]
  weeklyCandidates: XDailyCandidate[]
  hiddenGemCandidates: XDailyCandidate[]
  eventHighlights: XEventHighlight[]
  eligibleStoreCount: number
  weeklyEligibleStoreCount: number
  hiddenGemEligibleStoreCount: number
}

export class XAutoPostPlanError extends Error {
  constructor(
    readonly code: 'database_unavailable' | 'insufficient_reliable_stores' | 'post_too_long',
    message: string,
  ) {
    super(message)
    this.name = 'XAutoPostPlanError'
  }
}

function booleanValue(value: string | undefined, fallback: boolean) {
  if (value == null || value.trim() === '') return fallback
  return /^(1|true|yes|on)$/i.test(value.trim())
}

function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

export function getXAutoPostConfig(env: Record<string, string | undefined> = process.env): XAutoPostConfig {
  const credentialsConfigured = [
    env.X_API_KEY,
    env.X_API_SECRET,
    env.X_ACCESS_TOKEN,
    env.X_ACCESS_TOKEN_SECRET,
  ].every((value) => Boolean(value?.trim()))

  return {
    enabled: booleanValue(env.X_AUTO_POST_ENABLED, false),
    credentialsConfigured,
    includeUrl: booleanValue(env.X_AUTO_POST_INCLUDE_URL, true),
    targetUrl: env.X_AUTO_POST_URL?.trim() || DEFAULT_TARGET_URL,
    minimumDataConfidence: boundedNumber(env.X_AUTO_POST_MIN_CONFIDENCE, 60, 0, 100),
  }
}

function dateParts(value: string | Date, locale = 'en-CA') {
  const date = typeof value === 'string' ? new Date(value) : value
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    weekday: get('weekday'),
    hour: get('hour'),
    minute: get('minute'),
  }
}

function dateKey(value: string | Date) {
  const parts = dateParts(value)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function shiftDateKey(value: string, days: number) {
  const shifted = new Date(`${value}T12:00:00+09:00`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return dateKey(shifted)
}

function displayTrendTime(value: string | Date) {
  const parts = dateParts(value, 'ja-JP')
  return `${Number(parts.month)}/${Number(parts.day)} ${parts.hour}:${parts.minute}`
}

function sanitizeSingleLine(value: string) {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function xStoreName(summary: PublicStoreSummary) {
  return sanitizeSingleLine(formatPublicStoreName(summary.store))
}

function truncateCodePoints(value: string, maximum: number) {
  const characters = Array.from(value)
  if (characters.length <= maximum) return value
  return `${characters.slice(0, Math.max(1, maximum - 1)).join('')}…`
}

function characterWeight(codePoint: number) {
  if (
    (codePoint >= 0 && codePoint <= 0x10ff) ||
    (codePoint >= 0x2000 && codePoint <= 0x200d) ||
    (codePoint >= 0x2010 && codePoint <= 0x201f) ||
    (codePoint >= 0x2032 && codePoint <= 0x2037)
  ) {
    return 1
  }
  return 2
}

function weightedLengthWithoutUrls(value: string) {
  return Array.from(value).reduce((total, character) => total + characterWeight(character.codePointAt(0) ?? 0), 0)
}

export function xWeightedLength(value: string) {
  const urlPattern = /https?:\/\/[^\s]+/giu
  let total = 0
  let cursor = 0
  for (const match of value.matchAll(urlPattern)) {
    const index = match.index ?? cursor
    total += weightedLengthWithoutUrls(value.slice(cursor, index))
    total += X_TRANSFORMED_URL_LENGTH
    cursor = index + match[0].length
  }
  return total + weightedLengthWithoutUrls(value.slice(cursor))
}

export function parseXAutoPostSlot(value?: string | null): XAutoPostSlot | null {
  return xAutoPostSlots.find((slot) => slot === value) ?? null
}

export function inferXAutoPostSlot(value: string | Date = new Date()): XAutoPostSlot {
  const hour = Number(dateParts(value).hour)
  if (hour >= 21 || hour < 3) return 'tomorrow'
  if (hour >= 15) return 'evening'
  return 'midday'
}

function isReliableSummary(summary: PublicStoreSummary, minimumDataConfidence: number) {
  return (
    summary.insight.reliability === 'fresh' &&
    summary.source?.lastStatus === 'ok' &&
    summary.dataConfidence >= minimumDataConfidence
  )
}

function compareDailyCandidates(left: PublicStoreSummary, right: PublicStoreSummary) {
  return (
    right.recentPostCount - left.recentPostCount ||
    right.recentThreeHourCount - left.recentThreeHourCount ||
    right.insight.activity.estimatedVisitIntentCount - left.insight.activity.estimatedVisitIntentCount ||
    right.dataConfidence - left.dataConfidence ||
    right.point.score - left.point.score ||
    left.store.name.localeCompare(right.store.name, 'ja')
  )
}

function candidate(
  input: Omit<XDailyCandidate, 'rank' | 'heatLabel'>,
  rank: number,
  heatLabel = formatHeatLabel(rank),
): XDailyCandidate {
  return {
    ...input,
    rank,
    heatLabel,
  }
}

function safeCount(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = values.toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function hiddenGemDetail(summary: PublicStoreSummary) {
  const details = [
    summary.femalePostCount > 0 ? `女性${summary.femalePostCount}件` : '',
    summary.recentThreeHourCount > 0 ? `直近3h ${summary.recentThreeHourCount}件` : '',
    summary.estimatedVisitIntentCount > 0 ? `予告${summary.estimatedVisitIntentCount}件` : '',
    summary.todayEventCount > 0 ? `予定${summary.todayEventCount}件` : '',
  ].filter(Boolean)
  return details.slice(0, 2).join('・') || `投稿${summary.recentPostCount}件`
}

export function selectXHiddenGemCandidates(
  summaries: PublicStoreSummary[],
  excludedStoreIds: ReadonlySet<string>,
  minimumDataConfidence = 60,
): { candidates: XDailyCandidate[]; eligibleStoreCount: number } {
  const reliable = summaries.filter((summary) => isReliableSummary(summary, minimumDataConfidence))
  const medianPostCount = median(reliable.map((summary) => safeCount(summary.recentPostCount)))
  const eligible = reliable.filter((summary) => {
    if (excludedStoreIds.has(summary.store.id) || summary.recentPostCount <= 0) return false
    return (
      safeCount(summary.femalePostCount) > 0 ||
      safeCount(summary.recentThreeHourCount) > 0 ||
      safeCount(summary.estimatedVisitIntentCount) > 0 ||
      safeCount(summary.todayEventCount) > 0
    )
  })
  const lowerVolume = eligible.filter((summary) => summary.recentPostCount <= medianPostCount)
  const candidatePool = lowerVolume.length >= 3 ? lowerVolume : eligible

  const ranked = candidatePool.toSorted((left, right) => {
    const signalScore = (summary: PublicStoreSummary) => {
      const genderSampleCount = safeCount(summary.genderSampleCount)
      const femaleRatio = genderSampleCount > 0 ? safeCount(summary.femalePostCount) / genderSampleCount : 0
      const volumePenalty = Math.max(0, safeCount(summary.recentPostCount) - medianPostCount) * 2
      return (
        Math.min(6, safeCount(summary.femalePostCount)) * 7 +
        Math.min(5, safeCount(summary.recentThreeHourCount)) * 6 +
        Math.min(5, safeCount(summary.estimatedVisitIntentCount)) * 5 +
        Math.min(2, safeCount(summary.todayEventCount)) * 4 +
        femaleRatio * 20 +
        safeCount(summary.dataConfidence) / 10 -
        volumePenalty
      )
    }
    return (
      signalScore(right) - signalScore(left) ||
      right.femalePostCount - left.femalePostCount ||
      right.recentThreeHourCount - left.recentThreeHourCount ||
      left.recentPostCount - right.recentPostCount ||
      left.store.name.localeCompare(right.store.name, 'ja')
    )
  })

  return {
    eligibleStoreCount: eligible.length,
    candidates: ranked.slice(0, 3).map((summary, index) => candidate({
      storeId: summary.store.id,
      storeName: xStoreName(summary),
      postCount: summary.recentPostCount,
      recentThreeHourCount: summary.recentThreeHourCount,
      dataConfidence: summary.dataConfidence,
      detail: hiddenGemDetail(summary),
    }, index + 1, '👀 穴場')),
  }
}

export function selectXDailyCandidates(
  summaries: PublicStoreSummary[],
  minimumDataConfidence = 60,
): { candidates: XDailyCandidate[]; eligibleStoreCount: number } {
  const eligible = summaries
    .filter((summary) => summary.recentPostCount > 0 && isReliableSummary(summary, minimumDataConfidence))
    .toSorted(compareDailyCandidates)

  return {
    eligibleStoreCount: eligible.length,
    candidates: eligible.slice(0, 3).map((summary, index) => candidate({
        storeId: summary.store.id,
        storeName: xStoreName(summary),
        postCount: summary.recentPostCount,
        recentThreeHourCount: summary.recentThreeHourCount,
        dataConfidence: summary.dataConfidence,
        detail: `投稿${summary.recentPostCount}件`,
      }, index + 1)),
  }
}

export function selectXWeeklyCandidates(
  state: PublicDirectoryState,
  minimumDataConfidence = 60,
): { candidates: XDailyCandidate[]; eligibleStoreCount: number } {
  const summaryByStoreId = new Map(
    state.summaries
      .filter((summary) => isReliableSummary(summary, minimumDataConfidence))
      .map((summary) => [summary.store.id, summary]),
  )
  const eligible = state.weeklyMomentum.stores
    .filter((item) => item.status === 'measured' && item.postDelta > 0 && summaryByStoreId.has(item.storeId))
    .toSorted((left, right) =>
      (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
      right.postDelta - left.postDelta,
    )

  return {
    eligibleStoreCount: eligible.length,
    candidates: eligible.slice(0, 3).map((item, index) => {
      const summary = summaryByStoreId.get(item.storeId)!
      return candidate({
        storeId: item.storeId,
        storeName: xStoreName(summary),
        postCount: item.currentPostCount,
        recentThreeHourCount: summary.recentThreeHourCount,
        dataConfidence: summary.dataConfidence,
        detail: `7日前比+${item.postDelta}件`,
      }, index + 1)
    }),
  }
}

export function selectXTomorrowCandidates(
  state: PublicDirectoryState,
  targetDateKey: string,
  minimumDataConfidence = 60,
): { candidates: XDailyCandidate[]; eligibleStoreCount: number } {
  const storeById = new Map(state.stores.map((store) => [store.id, store]))
  const summaryByStoreId = new Map(
    state.summaries
      .filter((summary) => isReliableSummary(summary, minimumDataConfidence))
      .map((summary) => [summary.store.id, summary]),
  )
  const intentKeysByStore = new Map<string, Set<string>>()
  state.normalizedPosts
    .filter(isRankableCustomerNormalizedPost)
    .forEach((post) => {
      if (!post.postedAt) return
      const store = storeById.get(post.storeId)
      if (!store) return
      const record: PostRecord = {
        id: post.id,
        storeId: post.storeId,
        source: 'scrape',
        sourceUrl: post.sourceUrl,
        postedAt: post.postedAt,
        body: post.body,
        keywords: [],
      }
      if (postDecisionDateKeyForStore(record, store) !== targetDateKey) return
      if (!isExplicitVisitIntentBody(post.body)) return
      const normalizedAuthor = post.authorName.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ja-JP')
      const normalizedBody = post.body
        .replace(/^\[\[NR_TARGET_DATE:\d{4}-\d{2}-\d{2}\]\]\s*/u, '')
        .normalize('NFKC')
        .replace(/\s+/g, '')
        .toLocaleLowerCase('ja-JP')
      const intentKey = normalizedAuthor && normalizedAuthor !== '記載なし'
        ? `author:${normalizedAuthor}`
        : `body:${normalizedBody}`
      const keys = intentKeysByStore.get(post.storeId) ?? new Set<string>()
      keys.add(intentKey)
      intentKeysByStore.set(post.storeId, keys)
    })

  const eventsByStore = new Map<string, typeof state.events>()
  state.events
    .filter((event) => event.date === targetDateKey)
    .forEach((event) => eventsByStore.set(event.storeId, [...(eventsByStore.get(event.storeId) ?? []), event]))

  const eligible = [...summaryByStoreId.values()]
    .map((summary) => {
      const intentCount = intentKeysByStore.get(summary.store.id)?.size ?? 0
      const events = eventsByStore.get(summary.store.id) ?? []
      return {
        summary,
        intentCount,
        events,
        weight: intentCount * 12 + events.length * 6 + summary.recentThreeHourCount * 2 + summary.recentPostCount,
      }
    })
    .filter((item) => item.intentCount > 0 || item.events.length > 0)
    .toSorted((left, right) =>
      right.weight - left.weight ||
      right.intentCount - left.intentCount ||
      right.events.length - left.events.length ||
      left.summary.store.name.localeCompare(right.summary.store.name, 'ja'),
    )

  return {
    eligibleStoreCount: eligible.length,
    candidates: eligible.slice(0, 3).map((item, index) => {
      const eventTitle = item.events[0]?.title ? truncateCodePoints(sanitizeSingleLine(item.events[0].title), 9) : ''
      const detail = [
        item.intentCount ? `予告${item.intentCount}件` : '',
        eventTitle || (item.events.length ? `予定${item.events.length}件` : ''),
      ].filter(Boolean).join('・')
      return candidate({
        storeId: item.summary.store.id,
        storeName: xStoreName(item.summary),
        postCount: item.intentCount,
        recentThreeHourCount: item.summary.recentThreeHourCount,
        dataConfidence: item.summary.dataConfidence,
        detail,
      }, index + 1)
    }),
  }
}

function deterministicIndex(seed: string, length: number) {
  if (length <= 1) return 0
  return createHash('sha256').update(seed).digest().readUInt32BE(0) % length
}

function deterministicCopy<T>(values: readonly T[], seed: string) {
  return values[deterministicIndex(seed, values.length)] ?? values[0]
}

function memoTitle(slot: XAutoPostSlot, targetDateKey: string) {
  return deterministicCopy(memoTitlesBySlot[slot], `${slot}:${targetDateKey}:memo`)
}

function weeklyIncrease(candidateItem: XDailyCandidate) {
  return candidateItem.detail.match(/\+(\d+)件/u)?.[1] ?? '0'
}

function sanitizedEventTitle(value: string) {
  return sanitizeSingleLine(value)
}

export function buildXShareTargetUrl(targetUrl: string, targetDateKey: string, slot: XAutoPostSlot) {
  try {
    const url = new URL(targetUrl)
    if (url.hostname === 'night-radar.vercel.app' && (url.pathname === '/' || url.pathname === '/app')) {
      url.pathname = '/share'
    }
    url.searchParams.set('report', `${targetDateKey}-${slot}`)
    url.searchParams.set('utm_source', 'x')
    url.searchParams.set('utm_medium', 'social')
    url.searchParams.set('utm_campaign', 'auto_post')
    url.searchParams.set('card', 'v2')
    return url.toString()
  } catch {
    return targetUrl
  }
}

type ScheduledCopyDensity = {
  countSuffix: boolean
  eventNameMode: 'store' | 'rank'
  eventTitleLimit: number
  hiddenCount: boolean
  layout: 'stacked' | 'section' | 'compact'
  primaryStoreNameLimit: number
  separator: string
  storeNameLimit: number
}

const scheduledCopyDensities: readonly ScheduledCopyDensity[] = [
  {
    countSuffix: false,
    eventNameMode: 'rank',
    eventTitleLimit: 8,
    hiddenCount: false,
    layout: 'stacked',
    primaryStoreNameLimit: 32,
    separator: '━━',
    storeNameLimit: 32,
  },
  {
    countSuffix: false,
    eventNameMode: 'rank',
    eventTitleLimit: 6,
    hiddenCount: false,
    layout: 'stacked',
    primaryStoreNameLimit: 22,
    separator: '━━',
    storeNameLimit: 18,
  },
  {
    countSuffix: true,
    eventNameMode: 'store',
    eventTitleLimit: 18,
    hiddenCount: true,
    layout: 'section',
    primaryStoreNameLimit: 32,
    separator: '━━━━',
    storeNameLimit: 32,
  },
  {
    countSuffix: true,
    eventNameMode: 'store',
    eventTitleLimit: 13,
    hiddenCount: true,
    layout: 'section',
    primaryStoreNameLimit: 26,
    separator: '━━━━',
    storeNameLimit: 22,
  },
  {
    countSuffix: true,
    eventNameMode: 'rank',
    eventTitleLimit: 11,
    hiddenCount: true,
    layout: 'section',
    primaryStoreNameLimit: 22,
    separator: '━━━━',
    storeNameLimit: 18,
  },
  {
    countSuffix: true,
    eventNameMode: 'rank',
    eventTitleLimit: 8,
    hiddenCount: false,
    layout: 'compact',
    primaryStoreNameLimit: 20,
    separator: '━━━━',
    storeNameLimit: 14,
  },
  {
    countSuffix: false,
    eventNameMode: 'rank',
    eventTitleLimit: 8,
    hiddenCount: false,
    layout: 'compact',
    primaryStoreNameLimit: 16,
    separator: '━━',
    storeNameLimit: 14,
  },
  {
    countSuffix: false,
    eventNameMode: 'rank',
    eventTitleLimit: 3,
    hiddenCount: false,
    layout: 'compact',
    primaryStoreNameLimit: 12,
    separator: '━━',
    storeNameLimit: 8,
  },
] as const

function compactStoreName(value: string, maximum: number) {
  const normalized = sanitizeSingleLine(value)
  const body = normalized.replace(/^bar\s+/iu, '')
  return `bar ${truncateCodePoints(body, Math.max(3, maximum - 4))}`
}

function compactRankedItems(
  candidates: XDailyCandidate[],
  storeNameLimit: number,
  valueForCandidate: (candidate: XDailyCandidate) => string,
) {
  return candidates.map((item, index) => {
    const medal = medalByRank[index] ?? `${index + 1}位`
    return [
      `${medal}${compactStoreName(item.storeName, storeNameLimit)}`,
      valueForCandidate(item),
    ].filter(Boolean).join(' ')
  })
}

function compactEventLine(
  items: XEventHighlight[],
  density: ScheduledCopyDensity,
) {
  const events = items.filter((item) => Boolean(item.title)).slice(0, 2)
  if (!events.length) return ''
  return events
    .map((item, index) => {
      const storeLabel =
        density.eventNameMode === 'store'
          ? compactStoreName(item.storeName, density.storeNameLimit)
          : medalByRank[index] ?? `${index + 1}位`
      const title = truncateCodePoints(sanitizedEventTitle(item.title ?? ''), density.eventTitleLimit)
      return `${storeLabel}${density.eventNameMode === 'store' ? ' ' : ''}${title}`
    })
    .join('｜')
}

function renderScheduledMain(
  input: {
    slot: XAutoPostSlot
    generatedAt: string
    candidates: XDailyCandidate[]
    weeklyCandidates: XDailyCandidate[]
    hiddenGemCandidates: XDailyCandidate[]
    eventHighlights: XEventHighlight[]
  },
  density: ScheduledCopyDensity,
) {
  const eventLine = compactEventLine(input.eventHighlights, density)
  const eventHeading = input.slot === 'tomorrow' ? '━ 明日予定 ━' : '━ イベント ━'
  const countSuffix = density.countSuffix ? '件' : ''
  const dailyItems = compactRankedItems(input.candidates, density.primaryStoreNameLimit, (item) => `${item.postCount}${countSuffix}`)
  const weeklyItems = compactRankedItems(input.weeklyCandidates, density.storeNameLimit, (item) => `+${weeklyIncrease(item)}${countSuffix}`)
  const hiddenItems = compactRankedItems(
    input.hiddenGemCandidates,
    density.storeNameLimit,
    (item) => density.hiddenCount ? `${item.postCount}${countSuffix}` : '',
  )
  const dailyLine = dailyItems.join('｜')
  const weeklyLine = weeklyItems.join('｜')
  const hiddenLine = hiddenItems.join('｜')
  const title = `${memoTitle(input.slot, dateKey(input.generatedAt))}｜${displayTrendTime(input.generatedAt)}`
  const lines = density.layout === 'stacked'
    ? [
        title,
        '🔥投稿数',
        ...dailyItems,
        density.separator,
        '📈7日前比',
        ...weeklyItems,
        density.separator,
        '💎穴場',
        ...hiddenItems,
        ...(eventLine
          ? [
              density.separator,
              `${input.slot === 'tomorrow' ? '🔮明日予定' : '🎪イベント'}｜${eventLine}`,
            ]
          : []),
        '#ハプバー',
      ]
    : density.layout === 'section'
      ? [
        title,
        '━ 投稿数 ━',
        dailyLine,
        '━ 7日前比 ━',
        weeklyLine,
        '━ 穴場 ━',
        hiddenLine,
        ...(eventLine ? [eventHeading, eventLine] : []),
        '#ハプバー',
      ]
      : [
          title,
          `投稿｜${dailyLine}`,
          density.separator,
          `7日前比｜${weeklyLine}`,
          density.separator,
          `穴場｜${hiddenLine}`,
          ...(eventLine ? [density.separator, `${input.slot === 'tomorrow' ? '明日予定' : 'イベント'}｜${eventLine}`] : []),
          '#ハプバー',
        ]
  return lines
    .map((line) => line.trimEnd())
    .join('\n')
}

function buildScheduledThread(input: {
  slot: XAutoPostSlot
  generatedAt: string
  targetDateKey: string
  candidates: XDailyCandidate[]
  weeklyCandidates: XDailyCandidate[]
  hiddenGemCandidates: XDailyCandidate[]
  eventHighlights: XEventHighlight[]
  includeUrl: boolean
  targetUrl: string
}) {
  const candidates = scheduledCopyDensities.map((density) => renderScheduledMain(input, density))
  const mainText = candidates.find((text) => xWeightedLength(text) <= X_SAFE_WEIGHTED_LENGTH)

  if (!mainText) {
    const shortestLength = Math.min(...candidates.map(xWeightedLength))
    throw new XAutoPostPlanError(
      'post_too_long',
      `ランキング・7日前比・穴場・イベントを1投稿へ収められませんでした（最短${shortestLength}/280）。`,
    )
  }

  return [mainText, ...(input.includeUrl ? [input.targetUrl] : [])]
}

function selectionForSlot(state: PublicDirectoryState, slot: XAutoPostSlot, targetDateKey: string, minimumDataConfidence: number) {
  const primary = selectXDailyCandidates(state.summaries, minimumDataConfidence)
  const weekly = selectXWeeklyCandidates(state, minimumDataConfidence)
  const excludedStoreIds = new Set([
    ...primary.candidates.map((item) => item.storeId),
    ...weekly.candidates.map((item) => item.storeId),
  ])
  const hiddenGems = selectXHiddenGemCandidates(
    state.summaries,
    excludedStoreIds,
    minimumDataConfidence,
  )
  const eventsByStore = new Map<string, typeof state.events>()
  state.events
    .filter((event) => event.date === targetDateKey)
    .toSorted((left, right) => left.startsAt.localeCompare(right.startsAt) || left.title.localeCompare(right.title, 'ja'))
    .forEach((event) => eventsByStore.set(event.storeId, [...(eventsByStore.get(event.storeId) ?? []), event]))
  const eventHighlights = primary.candidates.slice(0, 2).map((item) => ({
    storeId: item.storeId,
    storeName: item.storeName,
    title: eventsByStore.get(item.storeId)?.[0]?.title
      ? sanitizedEventTitle(eventsByStore.get(item.storeId)![0].title)
      : null,
  }))

  return {
    ...primary,
    weeklyCandidates: weekly.candidates,
    weeklyEligibleStoreCount: weekly.eligibleStoreCount,
    hiddenGemCandidates: hiddenGems.candidates,
    hiddenGemEligibleStoreCount: hiddenGems.eligibleStoreCount,
    eventHighlights,
  }
}

function kindForSlot(slot: XAutoPostSlot): XAutoPostKind {
  if (slot === 'midday') return 'today_ranking'
  if (slot === 'evening') return 'weekly_momentum'
  return 'tomorrow_forecast'
}

function scheduledFor(date: string, slot: XAutoPostSlot) {
  const hour = slot === 'midday' ? '12' : slot === 'evening' ? '18' : '23'
  return new Date(`${date}T${hour}:00:00+09:00`).toISOString()
}

export function prepareXScheduledPost(
  state: PublicDirectoryState,
  slot: XAutoPostSlot,
  options: { includeUrl?: boolean; targetUrl?: string; minimumDataConfidence?: number } = {},
): XDailyPostPlan {
  if (state.mode !== 'database') {
    throw new XAutoPostPlanError('database_unavailable', '実データを取得できないため、X投稿を作成しませんでした。')
  }

  const config = getXAutoPostConfig()
  const minimumDataConfidence = options.minimumDataConfidence ?? config.minimumDataConfidence
  const sourceDateKey = dateKey(state.generatedAt)
  const targetDateKey = slot === 'tomorrow' ? shiftDateKey(sourceDateKey, 1) : sourceDateKey
  const {
    candidates,
    weeklyCandidates,
    hiddenGemCandidates,
    eventHighlights,
    eligibleStoreCount,
    weeklyEligibleStoreCount,
    hiddenGemEligibleStoreCount,
  } = selectionForSlot(
    state,
    slot,
    targetDateKey,
    minimumDataConfidence,
  )
  if (candidates.length < 3 || weeklyCandidates.length < 3 || hiddenGemCandidates.length < 3) {
    throw new XAutoPostPlanError(
      'insufficient_reliable_stores',
      `信頼できる投稿数候補が${candidates.length}店舗、7日前比候補が${weeklyCandidates.length}店舗、穴場候補が${hiddenGemCandidates.length}店舗のため、各3店舗そろうまでX投稿を見送ります。`,
    )
  }

  const includeUrl = options.includeUrl ?? config.includeUrl
  const targetUrl = buildXShareTargetUrl(options.targetUrl ?? config.targetUrl, targetDateKey, slot)
  const threadTexts = buildScheduledThread({
    slot,
    generatedAt: state.generatedAt,
    targetDateKey,
    candidates,
    weeklyCandidates,
    hiddenGemCandidates,
    eventHighlights,
    includeUrl,
    targetUrl,
  })
  const weightedLengths = threadTexts.map(xWeightedLength)
  const invalidLength = weightedLengths.find((length) => length > X_MAX_WEIGHTED_LENGTH)
  if (invalidLength) {
    throw new XAutoPostPlanError('post_too_long', `X投稿文が上限を超えています（${invalidLength}/280）。`)
  }
  const text = threadTexts[0] ?? ''
  const weightedLength = weightedLengths[0] ?? 0

  const kind = kindForSlot(slot)
  return {
    idempotencyKey: `${kind}:${targetDateKey}`,
    slot,
    kind,
    targetDateKey,
    scheduledFor: scheduledFor(sourceDateKey, slot),
    sourceGeneratedAt: state.generatedAt,
    text,
    replyTexts: threadTexts.slice(1),
    threadTexts,
    weightedLength,
    weightedLengths,
    contentHash: createHash('sha256').update(threadTexts.join('\n\n---\n\n')).digest('hex'),
    candidates,
    weeklyCandidates,
    hiddenGemCandidates,
    eventHighlights,
    eligibleStoreCount,
    weeklyEligibleStoreCount,
    hiddenGemEligibleStoreCount,
  }
}

export function prepareXDailyPost(
  state: PublicDirectoryState,
  options: { includeUrl?: boolean; targetUrl?: string; minimumDataConfidence?: number } = {},
) {
  return prepareXScheduledPost(state, 'midday', options)
}

export function buildXCreateRequest(text: string, replyToPostId?: string) {
  return {
    text,
    ...(replyToPostId ? { reply: { in_reply_to_tweet_id: replyToPostId } } : {}),
  }
}

export async function publishXPost(text: string, replyToPostId?: string) {
  const config = getXAutoPostConfig()
  if (!config.credentialsConfigured) throw new Error('X APIの4つの認証情報が不足しています。')

  const oauth1 = new OAuth1({
    apiKey: process.env.X_API_KEY!,
    apiSecret: process.env.X_API_SECRET!,
    callback: 'oob',
    accessToken: process.env.X_ACCESS_TOKEN!,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET!,
  })
  const client = new Client({ oauth1, timeout: 15_000, retry: true, maxRetries: 2 })
  const response = await client.posts.create(buildXCreateRequest(text, replyToPostId))
  const postId = typeof response.data?.id === 'string' ? response.data.id : ''
  if (!postId) {
    const detail = response.errors?.map((error) => error.detail || error.title).filter(Boolean).join(' / ')
    throw new Error(detail || 'X APIから投稿IDが返りませんでした。')
  }
  return { postId, url: `https://x.com/i/web/status/${postId}` }
}
