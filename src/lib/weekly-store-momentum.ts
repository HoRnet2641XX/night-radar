import { dedupeNormalizedBbsPosts, isRankableCustomerNormalizedPost } from './scoring'
import type {
  BbsNormalizedPost,
  StoreProfile,
  StoreWeeklyMomentum,
  WeeklyMomentumDataset,
} from './types'

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
export const WEEKLY_MOMENTUM_MINIMUM_COUNT = 3
const NEW_ACTIVITY_MINIMUM_COUNT = 5

export type WeeklyComparisonWindow = {
  currentStartsAt: string
  currentEndsAt: string
  previousStartsAt: string
  previousEndsAt: string
}

export function weeklyComparisonWindow(referenceAt = new Date().toISOString()): WeeklyComparisonWindow {
  const referenceMs = new Date(referenceAt).getTime()
  if (!Number.isFinite(referenceMs)) throw new Error('週次比較の基準日時が不正です。')

  const shifted = new Date(referenceMs + JST_OFFSET_MS)
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7
  const currentStartsAtMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysSinceMonday,
  ) - JST_OFFSET_MS
  const previousStartsAtMs = currentStartsAtMs - WEEK_MS
  const elapsedWeekMs = referenceMs - currentStartsAtMs

  return {
    currentStartsAt: new Date(currentStartsAtMs).toISOString(),
    currentEndsAt: new Date(referenceMs).toISOString(),
    previousStartsAt: new Date(previousStartsAtMs).toISOString(),
    previousEndsAt: new Date(previousStartsAtMs + elapsedWeekMs).toISOString(),
  }
}

function countPostsByStore(
  posts: BbsNormalizedPost[],
  startsAt: string,
  endsAt: string,
) {
  const startsAtMs = new Date(startsAt).getTime()
  const endsAtMs = new Date(endsAt).getTime()
  const counts = new Map<string, number>()

  posts.forEach((post) => {
    if (!post.postedAt) return
    const postedAtMs = new Date(post.postedAt).getTime()
    if (!Number.isFinite(postedAtMs) || postedAtMs < startsAtMs || postedAtMs > endsAtMs) return
    counts.set(post.storeId, (counts.get(post.storeId) ?? 0) + 1)
  })

  return counts
}

function momentumForStore(
  storeId: string,
  currentPostCount: number,
  previousPostCount: number,
  comparisonDayCount: number,
  minimumComparisonCount: number,
): StoreWeeklyMomentum {
  const postDelta = currentPostCount - previousPostCount
  const currentDailyAverage = Math.round((currentPostCount / comparisonDayCount) * 10) / 10
  const previousDailyAverage = Math.round((previousPostCount / comparisonDayCount) * 10) / 10
  const dailyAverageDelta = Math.round(((currentPostCount - previousPostCount) / comparisonDayCount) * 10) / 10
  const measured = currentPostCount >= minimumComparisonCount && previousPostCount >= minimumComparisonCount
  const status = measured
    ? 'measured'
    : currentPostCount >= NEW_ACTIVITY_MINIMUM_COUNT && previousPostCount < minimumComparisonCount
      ? 'new_activity'
      : currentPostCount > 0 || previousPostCount > 0
        ? 'low_sample'
        : 'no_activity'
  const momentumPercent = measured
    ? Math.round((currentPostCount / (currentPostCount + previousPostCount)) * 100)
    : null
  const weekOverWeekRatio = measured ? Math.round((currentPostCount / previousPostCount) * 100) : null

  return {
    storeId,
    currentPostCount,
    previousPostCount,
    postDelta,
    comparisonDayCount,
    currentDailyAverage,
    previousDailyAverage,
    dailyAverageDelta,
    momentumPercent,
    weekOverWeekRatio,
    changePercent: weekOverWeekRatio === null ? null : weekOverWeekRatio - 100,
    status,
    rank: null,
  }
}

export function buildWeeklyMomentumDataset(input: {
  stores: Pick<StoreProfile, 'id'>[]
  normalizedPosts: BbsNormalizedPost[]
  referenceAt?: string
  minimumComparisonCount?: number
}): WeeklyMomentumDataset {
  const referenceAt = input.referenceAt ?? new Date().toISOString()
  const window = weeklyComparisonWindow(referenceAt)
  const elapsedMs = new Date(window.currentEndsAt).getTime() - new Date(window.currentStartsAt).getTime()
  const comparisonDayCount = Math.min(7, Math.max(1, Math.ceil(elapsedMs / DAY_MS)))
  const minimumComparisonCount = Math.max(1, input.minimumComparisonCount ?? WEEKLY_MOMENTUM_MINIMUM_COUNT)
  const validPosts = dedupeNormalizedBbsPosts(input.normalizedPosts).filter(isRankableCustomerNormalizedPost)
  const currentCounts = countPostsByStore(validPosts, window.currentStartsAt, window.currentEndsAt)
  const previousCounts = countPostsByStore(validPosts, window.previousStartsAt, window.previousEndsAt)
  const stores = input.stores.map((store) => momentumForStore(
    store.id,
    currentCounts.get(store.id) ?? 0,
    previousCounts.get(store.id) ?? 0,
    comparisonDayCount,
    minimumComparisonCount,
  ))
  const measuredRanking = stores
    .filter((store) => store.status === 'measured')
    .toSorted((left, right) =>
      right.dailyAverageDelta - left.dailyAverageDelta
      || (right.weekOverWeekRatio ?? 0) - (left.weekOverWeekRatio ?? 0)
      || right.currentPostCount - left.currentPostCount
      || left.storeId.localeCompare(right.storeId),
    )

  measuredRanking.forEach((store, index) => {
    store.rank = index + 1
  })

  return {
    ...window,
    comparisonDayCount,
    minimumComparisonCount,
    measuredStoreCount: measuredRanking.length,
    newActivityStoreCount: stores.filter((store) => store.status === 'new_activity').length,
    stores,
  }
}
