import { weekdayFromDate, weekdayLabels } from './date'
import {
  decisionDateKeyInJapan,
  hasExplicitFemaleAuthorGender,
  isRankableCustomerNormalizedPost,
} from './scoring'
import type { BbsNormalizedPost } from './types'

export const FEMALE_RETENTION_WINDOW_WEEKS = 8

export type FemaleRetentionStatus = 'measured' | 'low_sample' | 'unavailable'

export type FemaleRetentionWeekday = {
  weekday: (typeof weekdayLabels)[number]
  eligibleAuthorCount: number
  returningAuthorCount: number
  retentionRate: number
  postCount: number
  observedWeekCount: number
  status: FemaleRetentionStatus
}

export type FemaleRetentionDataset = {
  generatedAt: string
  periodStartKey: string
  periodEndKey: string
  windowWeeks: number
  eligibleAuthorWeekdayCount: number
  returningAuthorWeekdayCount: number
  retentionRate: number
  eligiblePostCount: number
  observedWeekCount: number
  status: FemaleRetentionStatus
  weekdays: FemaleRetentionWeekday[]
  methodology: string
  caution: string
}

const ignoredAuthorNames = new Set([
  '記載なし',
  '匿名',
  '名無し',
  'ななし',
  'noname',
  'guest',
  'ゲスト',
  '女性',
  '女',
  '単女',
  '単独女性',
  'スタッフ',
  'staff',
  '管理人',
  'admin',
])

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00+09:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function weekKeyForDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00+09:00`)
  const daysSinceMonday = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - daysSinceMonday)
  return date.toISOString().slice(0, 10)
}

function statusForSample(eligibleAuthorCount: number): FemaleRetentionStatus {
  if (eligibleAuthorCount === 0) return 'unavailable'
  return eligibleAuthorCount >= 3 ? 'measured' : 'low_sample'
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

export function normalizeRetentionAuthorName(value: string) {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .replace(/[（(](?:女性|女|単女|単独女性|♀)[）)]$/u, '')
    .replace(/\s+/g, '')
    .toLocaleLowerCase('ja-JP')
  if (
    !normalized ||
    normalized.length > 60 ||
    ignoredAuthorNames.has(normalized) ||
    !/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(normalized)
  ) {
    return ''
  }
  return normalized
}

export function femaleRetentionWindow(
  referenceAt: string | number | Date = new Date(),
  windowWeeks = FEMALE_RETENTION_WINDOW_WEEKS,
) {
  const endKey = decisionDateKeyInJapan(referenceAt)
  if (!endKey) throw new Error('基準日時を日本時間の営業日に変換できません。')
  const normalizedWeeks = Math.max(2, Math.floor(windowWeeks))
  const startKey = shiftDateKey(endKey, -(normalizedWeeks * 7 - 1))
  return {
    startKey,
    endKey,
    windowWeeks: normalizedWeeks,
    postedAfter: `${startKey}T06:00:00+09:00`,
  }
}

export function buildFemaleRetentionDataset(input: {
  posts: BbsNormalizedPost[]
  referenceAt?: string | number | Date
  windowWeeks?: number
}): FemaleRetentionDataset {
  const referenceAt = input.referenceAt ?? new Date()
  const window = femaleRetentionWindow(referenceAt, input.windowWeeks)
  const generatedAt = referenceAt instanceof Date ? referenceAt.toISOString() : new Date(referenceAt).toISOString()
  const weekdayAuthors = new Map<string, Map<string, Set<string>>>()
  const weekdayPostCount = new Map<string, number>()
  const observedWeeks = new Set<string>()

  for (const post of input.posts) {
    if (!isRankableCustomerNormalizedPost(post) || !post.postedAt) continue
    if (!hasExplicitFemaleAuthorGender(post.authorGender)) continue
    const authorKey = normalizeRetentionAuthorName(post.authorName)
    if (!authorKey) continue
    const dateKey = decisionDateKeyInJapan(post.postedAt)
    if (!dateKey || dateKey < window.startKey || dateKey > window.endKey) continue
    const weekday = weekdayFromDate(dateKey)
    if (!weekdayLabels.includes(weekday as (typeof weekdayLabels)[number])) continue
    const weekKey = weekKeyForDateKey(dateKey)
    const authors = weekdayAuthors.get(weekday) ?? new Map<string, Set<string>>()
    const authorWeeks = authors.get(authorKey) ?? new Set<string>()
    authorWeeks.add(weekKey)
    authors.set(authorKey, authorWeeks)
    weekdayAuthors.set(weekday, authors)
    weekdayPostCount.set(weekday, (weekdayPostCount.get(weekday) ?? 0) + 1)
    observedWeeks.add(weekKey)
  }

  const weekdays = weekdayLabels.map((weekday): FemaleRetentionWeekday => {
    const authors = weekdayAuthors.get(weekday) ?? new Map<string, Set<string>>()
    const eligibleAuthorCount = authors.size
    const returningAuthorCount = [...authors.values()].filter((weeks) => weeks.size >= 2).length
    const weekdayWeeks = new Set([...authors.values()].flatMap((weeks) => [...weeks]))
    return {
      weekday,
      eligibleAuthorCount,
      returningAuthorCount,
      retentionRate: percentage(returningAuthorCount, eligibleAuthorCount),
      postCount: weekdayPostCount.get(weekday) ?? 0,
      observedWeekCount: weekdayWeeks.size,
      status: statusForSample(eligibleAuthorCount),
    }
  })
  const eligibleAuthorWeekdayCount = weekdays.reduce((total, item) => total + item.eligibleAuthorCount, 0)
  const returningAuthorWeekdayCount = weekdays.reduce((total, item) => total + item.returningAuthorCount, 0)

  return {
    generatedAt,
    periodStartKey: window.startKey,
    periodEndKey: window.endKey,
    windowWeeks: window.windowWeeks,
    eligibleAuthorWeekdayCount,
    returningAuthorWeekdayCount,
    retentionRate: percentage(returningAuthorWeekdayCount, eligibleAuthorWeekdayCount),
    eligiblePostCount: [...weekdayPostCount.values()].reduce((total, count) => total + count, 0),
    observedWeekCount: observedWeeks.size,
    status: statusForSample(eligibleAuthorWeekdayCount),
    weekdays,
    methodology: '同じ店舗で、同じ投稿者名が同じ曜日に別週でも確認できた割合です。06:00を営業日の区切りとし、投稿者区分に女性と明記された投稿だけを集計します。',
    caution: '同名の別人や名前変更は識別できないため参考値です。投稿者名そのものは表示・返却しません。',
  }
}
