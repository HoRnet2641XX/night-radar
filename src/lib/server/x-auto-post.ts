import { createHash } from 'node:crypto'
import { Client, OAuth1 } from '@xdevplatform/xdk'
import { formatHeatLabel } from '@/lib/heat-labels'
import { formatPublicStoreName, type PublicDirectoryState, type PublicStoreSummary } from '@/lib/public-directory'
import { isExplicitVisitIntentBody, isRankableCustomerNormalizedPost, postDecisionDateKeyForStore } from '@/lib/scoring'
import type { PostRecord } from '@/lib/types'

const DEFAULT_TARGET_URL = 'https://night-radar.vercel.app/app'
const X_MAX_WEIGHTED_LENGTH = 280
const X_SAFE_WEIGHTED_LENGTH = 275
const X_TRANSFORMED_URL_LENGTH = 23
const medalByRank = ['🥇', '🥈', '🥉'] as const

export const xAutoPostSlots = ['midday', 'evening', 'tomorrow'] as const
export type XAutoPostSlot = (typeof xAutoPostSlots)[number]
export type XAutoPostKind = 'today_ranking' | 'weekly_momentum' | 'tomorrow_forecast'

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

export type XDailyPostPlan = {
  idempotencyKey: string
  slot: XAutoPostSlot
  kind: XAutoPostKind
  targetDateKey: string
  scheduledFor: string
  sourceGeneratedAt: string
  text: string
  weightedLength: number
  contentHash: string
  candidates: XDailyCandidate[]
  hiddenGemCandidates: XDailyCandidate[]
  eligibleStoreCount: number
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

function displayDate(value: string | Date) {
  const parts = dateParts(value, 'ja-JP')
  return `${Number(parts.month)}/${Number(parts.day)}(${parts.weekday})`
}

function displayCurrentTime(value: string | Date) {
  const parts = dateParts(value, 'ja-JP')
  return `${displayDate(value)} ${parts.hour}:${parts.minute}現在`
}

function displayCompactCurrentTime(value: string | Date) {
  const parts = dateParts(value, 'ja-JP')
  return `${Number(parts.month)}/${Number(parts.day)} ${parts.hour}:${parts.minute}時点`
}

function sanitizeSingleLine(value: string) {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function xStoreName(summary: PublicStoreSummary) {
  return sanitizeSingleLine(formatPublicStoreName(summary.store)).replace(/^bar\s+/i, '')
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
    right.insight.activity.estimatedVisitIntentCount - left.insight.activity.estimatedVisitIntentCount ||
    right.recentPostCount - left.recentPostCount ||
    right.recentThreeHourCount - left.recentThreeHourCount ||
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
    .filter((summary) => summary.insight.activity.estimatedVisitIntentCount > 0 && isReliableSummary(summary, minimumDataConfidence))
    .toSorted(compareDailyCandidates)

  return {
    eligibleStoreCount: eligible.length,
    candidates: eligible.slice(0, 3).map((summary, index) => {
      const intentCount = summary.insight.activity.estimatedVisitIntentCount
      return candidate({
        storeId: summary.store.id,
        storeName: xStoreName(summary),
        postCount: intentCount,
        recentThreeHourCount: summary.recentThreeHourCount,
        dataConfidence: summary.dataConfidence,
        detail: `来店予告 ${intentCount}件`,
      }, index + 1)
    }),
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

function scheduledCandidateDetail(candidateItem: XDailyCandidate, slot: XAutoPostSlot) {
  return slot === 'midday' ? `予告${candidateItem.postCount}件` : candidateItem.detail
}

function compactMetric(value: string) {
  return value
    .split('・')[0]
    .replace(/来店予告\s*/u, '予告')
    .replace(/7日前比/u, '7日前')
    .replace(/\s+/g, '')
    .replace(/件$/u, '')
}

function buildScheduledText(input: {
  slot: XAutoPostSlot
  generatedAt: string
  targetDateKey: string
  candidates: XDailyCandidate[]
  hiddenGemCandidates: XDailyCandidate[]
  includeUrl: boolean
  targetUrl: string
  storeNameLength: number
  detailLength: number
  includeHeatLabels: boolean
  compact: boolean
}) {
  const headline = input.slot === 'tomorrow'
    ? '【明日予想】注目3＋穴場3🍸'
    : input.slot === 'evening'
      ? '【7日前比】伸び3＋穴場3🍸'
      : '【速報】盛り上がり3＋穴場3🍸'
  const primaryHeader = input.compact
    ? input.slot === 'midday' ? '🔥盛り上がり' : input.slot === 'evening' ? '🔥伸び' : '🔥明日注目'
    : input.slot === 'midday'
      ? '🔥 盛り上がり｜来店予告順'
      : input.slot === 'evening'
        ? '🔥 盛り上がり｜7日前比'
        : '🔥 盛り上がり｜明日予想'
  const primaryLines = input.candidates.map((item, index) => {
    const medal = medalByRank[index] ?? `${index + 1}位`
    const storeName = truncateCodePoints(item.storeName, input.storeNameLength)
    const sourceDetail = scheduledCandidateDetail(item, input.slot)
    const detail = truncateCodePoints(input.compact ? compactMetric(sourceDetail) : sourceDetail, input.detailLength)
    return input.compact
      ? `${medal}${storeName} ${detail}`
      : `${medal}${storeName}｜${input.includeHeatLabels ? `${item.heatLabel} ` : ''}${detail}`
  })
  const hiddenLines = input.hiddenGemCandidates.map((item, index) => {
    const rank = ['①', '②', '③'][index] ?? `${index + 1}`
    const detail = input.compact ? compactMetric(item.detail) : item.detail
    return input.compact
      ? `${rank}${truncateCodePoints(item.storeName, input.storeNameLength)} ${truncateCodePoints(detail, input.detailLength)}`
      : `${rank}${truncateCodePoints(item.storeName, input.storeNameLength)}｜${truncateCodePoints(detail, input.detailLength)}`
  })
  const context = input.slot === 'tomorrow'
    ? `${displayDate(`${input.targetDateKey}T12:00:00+09:00`)}予想`
    : input.compact ? displayCompactCurrentTime(input.generatedAt) : displayCurrentTime(input.generatedAt)
  const evidence = input.slot === 'evening'
    ? '6時区切り・7日前の同時刻までと比較'
    : input.slot === 'tomorrow'
      ? '明日の予定・来店予告から算出'
      : '公開BBSの来店予告・女性投稿・直近動向から算出'

  return [
    headline,
    primaryHeader,
    ...primaryLines,
    input.compact ? '👀比較で見つけた穴場' : '👀 比較で見つけた穴場',
    ...hiddenLines,
    context,
    ...(input.compact ? [] : [evidence]),
    ...(input.includeUrl ? [input.targetUrl] : []),
    '#NightRadar',
  ].join('\n')
}

function selectionForSlot(state: PublicDirectoryState, slot: XAutoPostSlot, targetDateKey: string, minimumDataConfidence: number) {
  const primary = slot === 'midday'
    ? selectXDailyCandidates(state.summaries, minimumDataConfidence)
    : slot === 'evening'
      ? selectXWeeklyCandidates(state, minimumDataConfidence)
      : selectXTomorrowCandidates(state, targetDateKey, minimumDataConfidence)
  const hiddenGems = selectXHiddenGemCandidates(
    state.summaries,
    new Set(primary.candidates.map((item) => item.storeId)),
    minimumDataConfidence,
  )
  return { ...primary, hiddenGemCandidates: hiddenGems.candidates, hiddenGemEligibleStoreCount: hiddenGems.eligibleStoreCount }
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
  const { candidates, eligibleStoreCount, hiddenGemCandidates, hiddenGemEligibleStoreCount } = selectionForSlot(
    state,
    slot,
    targetDateKey,
    minimumDataConfidence,
  )
  if (candidates.length < 3 || hiddenGemCandidates.length < 3) {
    throw new XAutoPostPlanError(
      'insufficient_reliable_stores',
      `信頼できる盛り上がり候補が${candidates.length}店舗、穴場候補が${hiddenGemCandidates.length}店舗のため、各3店舗そろうまでX投稿を見送ります。`,
    )
  }

  const includeUrl = options.includeUrl ?? config.includeUrl
  const targetUrl = options.targetUrl ?? config.targetUrl
  const textCandidates = [
    buildScheduledText({
      slot,
      generatedAt: state.generatedAt,
      targetDateKey,
      candidates,
      hiddenGemCandidates,
      includeUrl,
      targetUrl,
      storeNameLength: 14,
      detailLength: 9,
      includeHeatLabels: true,
      compact: false,
    }),
    buildScheduledText({
      slot,
      generatedAt: state.generatedAt,
      targetDateKey,
      candidates,
      hiddenGemCandidates,
      includeUrl,
      targetUrl,
      storeNameLength: 18,
      detailLength: 7,
      includeHeatLabels: false,
      compact: true,
    }),
    buildScheduledText({
      slot,
      generatedAt: state.generatedAt,
      targetDateKey,
      candidates,
      hiddenGemCandidates,
      includeUrl,
      targetUrl,
      storeNameLength: 14,
      detailLength: 7,
      includeHeatLabels: false,
      compact: true,
    }),
    buildScheduledText({
      slot,
      generatedAt: state.generatedAt,
      targetDateKey,
      candidates,
      hiddenGemCandidates,
      includeUrl,
      targetUrl,
      storeNameLength: 12,
      detailLength: 7,
      includeHeatLabels: false,
      compact: true,
    }),
    buildScheduledText({
      slot,
      generatedAt: state.generatedAt,
      targetDateKey,
      candidates,
      hiddenGemCandidates,
      includeUrl,
      targetUrl,
      storeNameLength: 10,
      detailLength: 7,
      includeHeatLabels: false,
      compact: true,
    }),
    buildScheduledText({
      slot,
      generatedAt: state.generatedAt,
      targetDateKey,
      candidates,
      hiddenGemCandidates,
      includeUrl,
      targetUrl,
      storeNameLength: 8,
      detailLength: 6,
      includeHeatLabels: false,
      compact: true,
    }),
    buildScheduledText({
      slot,
      generatedAt: state.generatedAt,
      targetDateKey,
      candidates,
      hiddenGemCandidates,
      includeUrl,
      targetUrl,
      storeNameLength: 6,
      detailLength: 4,
      includeHeatLabels: false,
      compact: true,
    }),
  ]
  const text = textCandidates.find((candidateText) => xWeightedLength(candidateText) <= X_SAFE_WEIGHTED_LENGTH)
    ?? textCandidates.at(-1)!
  const weightedLength = xWeightedLength(text)
  if (weightedLength > X_MAX_WEIGHTED_LENGTH) {
    throw new XAutoPostPlanError('post_too_long', `X投稿文が上限を超えています（${weightedLength}/280）。`)
  }

  const kind = kindForSlot(slot)
  return {
    idempotencyKey: `${kind}:${targetDateKey}`,
    slot,
    kind,
    targetDateKey,
    scheduledFor: scheduledFor(sourceDateKey, slot),
    sourceGeneratedAt: state.generatedAt,
    text,
    weightedLength,
    contentHash: createHash('sha256').update(text).digest('hex'),
    candidates,
    hiddenGemCandidates,
    eligibleStoreCount,
    hiddenGemEligibleStoreCount,
  }
}

export function prepareXDailyPost(
  state: PublicDirectoryState,
  options: { includeUrl?: boolean; targetUrl?: string; minimumDataConfidence?: number } = {},
) {
  return prepareXScheduledPost(state, 'midday', options)
}

export async function publishXPost(text: string) {
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
  const response = await client.posts.create({ text })
  const postId = typeof response.data?.id === 'string' ? response.data.id : ''
  if (!postId) {
    const detail = response.errors?.map((error) => error.detail || error.title).filter(Boolean).join(' / ')
    throw new Error(detail || 'X APIから投稿IDが返りませんでした。')
  }
  return { postId, url: `https://x.com/i/web/status/${postId}` }
}
