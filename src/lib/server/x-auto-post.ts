import { createHash } from 'node:crypto'
import { Client, OAuth1 } from '@xdevplatform/xdk'
import { formatPublicStoreName, type PublicDirectoryState, type PublicStoreSummary } from '@/lib/public-directory'

const DEFAULT_TARGET_URL = 'https://night-radar.vercel.app/app'
const X_MAX_WEIGHTED_LENGTH = 280
const X_SAFE_WEIGHTED_LENGTH = 275
const X_TRANSFORMED_URL_LENGTH = 23

export type XAutoPostConfig = {
  enabled: boolean
  credentialsConfigured: boolean
  includeUrl: boolean
  targetUrl: string
  minimumDataConfidence: number
}

export type XDailyCandidate = {
  storeId: string
  storeName: string
  postCount: number
  recentThreeHourCount: number
  dataConfidence: number
}

export type XDailyPostPlan = {
  idempotencyKey: string
  kind: 'daily_ranking'
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

function japanDateParts(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return { year: get('year'), month: get('month'), day: get('day') }
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

function compareCandidates(left: PublicStoreSummary, right: PublicStoreSummary) {
  return (
    right.recentPostCount - left.recentPostCount ||
    right.recentThreeHourCount - left.recentThreeHourCount ||
    right.dataConfidence - left.dataConfidence ||
    right.point.score - left.point.score ||
    left.store.name.localeCompare(right.store.name, 'ja')
  )
}

export function selectXDailyCandidates(
  summaries: PublicStoreSummary[],
  minimumDataConfidence = 60,
): { candidates: XDailyCandidate[]; eligibleStoreCount: number } {
  const eligible = summaries
    .filter((summary) => (
      summary.recentPostCount > 0 &&
      summary.insight.reliability === 'fresh' &&
      summary.source?.lastStatus === 'ok' &&
      summary.dataConfidence >= minimumDataConfidence
    ))
    .toSorted(compareCandidates)

  return {
    eligibleStoreCount: eligible.length,
    candidates: eligible.slice(0, 3).map((summary) => ({
      storeId: summary.store.id,
      storeName: sanitizeSingleLine(formatPublicStoreName(summary.store)),
      postCount: summary.recentPostCount,
      recentThreeHourCount: summary.recentThreeHourCount,
      dataConfidence: summary.dataConfidence,
    })),
  }
}

function buildDailyText(input: {
  month: string
  day: string
  candidates: XDailyCandidate[]
  includeUrl: boolean
  targetUrl: string
  storeNameLength: number
}) {
  const rankingLines = input.candidates.map((candidate, index) => (
    `${index + 1}位 ${truncateCodePoints(candidate.storeName, input.storeNameLength)} ${candidate.postCount}件`
  ))
  return [
    `${Number(input.month)}/${Number(input.day)} 18時｜今日の投稿動向`,
    ...rankingLines,
    '',
    '公開BBSの当日顧客投稿を集計。店内人数ではありません。',
    ...(input.includeUrl ? [input.targetUrl] : []),
    '#NightRadar',
  ].join('\n')
}

export function prepareXDailyPost(
  state: PublicDirectoryState,
  options: { includeUrl?: boolean; targetUrl?: string; minimumDataConfidence?: number } = {},
): XDailyPostPlan {
  if (state.mode !== 'database') {
    throw new XAutoPostPlanError('database_unavailable', '実データを取得できないため、X投稿を作成しませんでした。')
  }

  const config = getXAutoPostConfig()
  const minimumDataConfidence = options.minimumDataConfidence ?? config.minimumDataConfidence
  const { candidates, eligibleStoreCount } = selectXDailyCandidates(state.summaries, minimumDataConfidence)
  if (candidates.length < 3) {
    throw new XAutoPostPlanError(
      'insufficient_reliable_stores',
      `信頼できる当日集計が${candidates.length}店舗のため、3店舗そろうまでX投稿を見送ります。`,
    )
  }

  const date = japanDateParts(state.generatedAt)
  const includeUrl = options.includeUrl ?? config.includeUrl
  const targetUrl = options.targetUrl ?? config.targetUrl
  let text = buildDailyText({ ...date, candidates, includeUrl, targetUrl, storeNameLength: 18 })
  if (xWeightedLength(text) > X_SAFE_WEIGHTED_LENGTH) {
    text = buildDailyText({ ...date, candidates, includeUrl, targetUrl, storeNameLength: 12 })
  }
  const weightedLength = xWeightedLength(text)
  if (weightedLength > X_MAX_WEIGHTED_LENGTH) {
    throw new XAutoPostPlanError('post_too_long', `X投稿文が上限を超えています（${weightedLength}/280）。`)
  }

  const dateKey = `${date.year}-${date.month}-${date.day}`
  return {
    idempotencyKey: `daily-ranking:${dateKey}:18`,
    kind: 'daily_ranking',
    scheduledFor: new Date(`${dateKey}T18:00:00+09:00`).toISOString(),
    sourceGeneratedAt: state.generatedAt,
    text,
    weightedLength,
    contentHash: createHash('sha256').update(text).digest('hex'),
    candidates,
    eligibleStoreCount,
  }
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
