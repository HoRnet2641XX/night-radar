import { createHash } from 'node:crypto'
import { Client, OAuth1 } from '@xdevplatform/xdk'
import { formatHeatLabel } from '@/lib/heat-labels'
import { formatPublicStoreName, type PublicDirectoryState, type PublicStoreSummary } from '@/lib/public-directory'
import { isRankableCustomerNormalizedPost, postDecisionDateKeyForStore } from '@/lib/scoring'
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
  eligibleStoreCount: number
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

function sanitizeSingleLine(value: string) {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
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

function candidate(input: Omit<XDailyCandidate, 'rank' | 'heatLabel'>, rank: number): XDailyCandidate {
  return {
    ...input,
    rank,
    heatLabel: formatHeatLabel(rank),
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
        storeName: sanitizeSingleLine(formatPublicStoreName(summary.store)),
        postCount: intentCount,
        recentThreeHourCount: summary.recentThreeHourCount,
        dataConfidence: summary.dataConfidence,
        detail: `来店意向 約${intentCount}組`,
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
    .filter((item) => item.status === 'measured' && item.dailyAverageDelta > 0 && summaryByStoreId.has(item.storeId))
    .toSorted((left, right) =>
      (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
      right.dailyAverageDelta - left.dailyAverageDelta,
    )

  return {
    eligibleStoreCount: eligible.length,
    candidates: eligible.slice(0, 3).map((item, index) => {
      const summary = summaryByStoreId.get(item.storeId)!
      return candidate({
        storeId: item.storeId,
        storeName: sanitizeSingleLine(formatPublicStoreName(summary.store)),
        postCount: item.currentPostCount,
        recentThreeHourCount: summary.recentThreeHourCount,
        dataConfidence: summary.dataConfidence,
        detail: `日平均+${Number.isInteger(item.dailyAverageDelta) ? item.dailyAverageDelta : item.dailyAverageDelta.toFixed(1)}件`,
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
  const intentCountByStore = new Map<string, number>()
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
      intentCountByStore.set(post.storeId, (intentCountByStore.get(post.storeId) ?? 0) + 1)
    })

  const eventsByStore = new Map<string, typeof state.events>()
  state.events
    .filter((event) => event.date === targetDateKey)
    .forEach((event) => eventsByStore.set(event.storeId, [...(eventsByStore.get(event.storeId) ?? []), event]))

  const eligible = [...summaryByStoreId.values()]
    .map((summary) => {
      const intentCount = intentCountByStore.get(summary.store.id) ?? 0
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
        storeName: sanitizeSingleLine(formatPublicStoreName(item.summary.store)),
        postCount: item.intentCount,
        recentThreeHourCount: item.summary.recentThreeHourCount,
        dataConfidence: item.summary.dataConfidence,
        detail,
      }, index + 1)
    }),
  }
}

function rankingLines(candidates: XDailyCandidate[], slot: XAutoPostSlot, storeNameLength: number, compact: boolean) {
  return candidates.flatMap((item, index) => {
    const medal = medalByRank[index] ?? `${index + 1}位`
    const storeName = truncateCodePoints(item.storeName, storeNameLength)
    if (slot === 'midday') return [`${medal} ${storeName}｜${item.heatLabel} 約${item.postCount}組`]
    if (slot === 'evening') return [`${medal} ${storeName}｜${item.heatLabel} ${item.detail}`]
    if (compact) return [`${medal} ${storeName}｜${item.heatLabel} ${item.detail}`]
    return [`${medal} ${storeName}｜${item.heatLabel}`, `└ ${item.detail}`]
  })
}

function buildScheduledText(input: {
  slot: XAutoPostSlot
  generatedAt: string
  targetDateKey: string
  candidates: XDailyCandidate[]
  includeUrl: boolean
  targetUrl: string
  storeNameLength: number
  compact: boolean
}) {
  const urlLines = input.includeUrl ? [input.targetUrl] : []
  const lines = rankingLines(input.candidates, input.slot, input.storeNameLength, input.compact)
  if (input.slot === 'midday') {
    return [
      input.compact ? '【速報】盛り上がりTOP3🍸' : '【速報】今どこのハプBARが盛り上がってる？🍸',
      '◼︎来店意向 TOP3◼︎',
      ...lines,
      '',
      displayCurrentTime(input.generatedAt),
      input.compact ? 'ランキング詳細👇' : '来店予告数・女性率・常連濃度はこちら👇',
      ...urlLines,
      '#NightRadar',
    ].join('\n')
  }
  if (input.slot === 'evening') {
    return [
      input.compact ? '【速報】先週より伸びた3店🍸' : '【速報】先週より盛り上がってるハプBARは？🍸',
      '◼︎同曜日の日平均 TOP3◼︎',
      ...lines,
      '',
      displayCurrentTime(input.generatedAt),
      input.compact ? '同じ曜日・同時刻までで比較👇' : '同じ曜日・同時刻までを1日平均に換算👇',
      ...urlLines,
      '#NightRadar',
    ].join('\n')
  }
  return [
    input.compact ? '【明日予想】注目3店🍸' : '【明日予想】どこのハプBARが動きそう？🍸',
    '◼︎イベント・来店予告 TOP3◼︎',
    ...lines,
    '',
    `${displayDate(`${input.targetDateKey}T12:00:00+09:00`)}の予想`,
    input.compact ? '明日の予定とBBSを確認👇' : '明日のイベントと公開BBSの来店予告を確認👇',
    ...urlLines,
    '#NightRadar',
  ].join('\n')
}

function buildTightScheduledText(input: {
  slot: XAutoPostSlot
  generatedAt: string
  targetDateKey: string
  candidates: XDailyCandidate[]
  includeUrl: boolean
  targetUrl: string
  storeNameLength: number
  detailLength: number
}) {
  const headline = input.slot === 'midday'
    ? '【速報】今日の注目3店🍸'
    : input.slot === 'evening'
      ? '【速報】先週比で伸びた3店🍸'
      : '【明日予想】注目3店🍸'
  const context = input.slot === 'midday'
    ? `${displayCurrentTime(input.generatedAt)}｜来店意向順`
    : input.slot === 'evening'
      ? `${displayCurrentTime(input.generatedAt)}｜同曜日・同時刻の日平均比較`
      : `${displayDate(`${input.targetDateKey}T12:00:00+09:00`)}｜予定・来店予告から算出`
  const lines = input.candidates.map((item, index) => {
    const medal = medalByRank[index] ?? `${index + 1}位`
    const storeName = truncateCodePoints(item.storeName, input.storeNameLength)
    const sourceDetail = input.slot === 'midday' ? `${item.postCount}組` : item.detail
    const detail = input.detailLength > 0 ? truncateCodePoints(sourceDetail, input.detailLength) : ''
    return `${medal} ${storeName}｜${item.heatLabel}${detail ? ` ${detail}` : ''}`
  })

  return [
    headline,
    ...lines,
    context,
    ...(input.includeUrl ? [input.targetUrl] : []),
    '#NightRadar',
  ].join('\n')
}

function selectionForSlot(state: PublicDirectoryState, slot: XAutoPostSlot, targetDateKey: string, minimumDataConfidence: number) {
  if (slot === 'midday') return selectXDailyCandidates(state.summaries, minimumDataConfidence)
  if (slot === 'evening') return selectXWeeklyCandidates(state, minimumDataConfidence)
  return selectXTomorrowCandidates(state, targetDateKey, minimumDataConfidence)
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
  const { candidates, eligibleStoreCount } = selectionForSlot(state, slot, targetDateKey, minimumDataConfidence)
  if (candidates.length < 3) {
    throw new XAutoPostPlanError(
      'insufficient_reliable_stores',
      `信頼できる${slot === 'tomorrow' ? '翌日候補' : '集計'}が${candidates.length}店舗のため、3店舗そろうまでX投稿を見送ります。`,
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
      includeUrl,
      targetUrl,
      storeNameLength: 18,
      compact: false,
    }),
    buildScheduledText({
      slot,
      generatedAt: state.generatedAt,
      targetDateKey,
      candidates,
      includeUrl,
      targetUrl,
      storeNameLength: 18,
      compact: true,
    }),
    buildScheduledText({
      slot,
      generatedAt: state.generatedAt,
      targetDateKey,
      candidates,
      includeUrl,
      targetUrl,
      storeNameLength: 12,
      compact: true,
    }),
    buildTightScheduledText({
      slot,
      generatedAt: state.generatedAt,
      targetDateKey,
      candidates,
      includeUrl,
      targetUrl,
      storeNameLength: 12,
      detailLength: 6,
    }),
    buildTightScheduledText({
      slot,
      generatedAt: state.generatedAt,
      targetDateKey,
      candidates,
      includeUrl,
      targetUrl,
      storeNameLength: 9,
      detailLength: 0,
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
    eligibleStoreCount,
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
