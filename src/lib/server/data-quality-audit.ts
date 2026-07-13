import type { OfficialEventCoverage } from '../official-event-coverage'
import {
  isObviousBbsSpamBody,
  isRankableCustomerNormalizedPost,
  isStructurallyValidCustomerNormalizedPost,
  normalizedBbsPostIdentityMaterial,
} from '../scoring'
import type { BbsNormalizedPost } from '../types'

type AuditStoreRow = {
  id: string
  address?: string | null
  nearest_station?: string | null
}

type AuditSourceRow = {
  id: string
  store_id: string
  label?: string | null
  last_status?: string | null
  last_message?: string | null
  last_fetched_at?: string | null
}

type AuditPostRow = {
  id: string
  source_id?: string | null
  store_id: string
  source_url?: string | null
  article_no?: string | null
  author_name?: string | null
  author_gender?: string | null
  posted_at?: string | null
  observed_at: string
  body?: string | null
  body_hash?: string | null
  content_key?: string | null
}

type AuditEventRow = {
  id: string
  store_id: string
  date_label: string
  title?: string | null
  source_url?: string | null
}

export type DataQualityAuditInput = {
  stores: AuditStoreRow[]
  sources: AuditSourceRow[]
  posts: AuditPostRow[]
  events: AuditEventRow[]
  eventCoverage: OfficialEventCoverage[]
  referenceAt?: string
  staleMinutes?: number
  minimumTimestampCoverage?: number
}

const weekdayLabels = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜']

export function nextMonthKey(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid month key: ${month}`)
  }
  return monthNumber === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNumber + 1).padStart(2, '0')}`
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0
}

function eventTitleWeekdayMismatch(event: AuditEventRow) {
  const title = event.title ?? ''
  const explicitWeekdays = [...title.matchAll(/([日月火水木金土])曜日/g)].map((match) => `${match[1]}曜`)
  if (!explicitWeekdays.length || title.includes('祝日')) return false
  const date = new Date(`${event.date_label}T00:00:00+09:00`)
  return Number.isNaN(date.getTime()) || !explicitWeekdays.includes(weekdayLabels[date.getDay()])
}

function toPost(row: AuditPostRow): BbsNormalizedPost {
  return {
    id: row.id,
    sourceId: row.source_id || undefined,
    storeId: row.store_id,
    sourceUrl: row.source_url || undefined,
    articleNo: row.article_no || undefined,
    authorName: row.author_name || '記載なし',
    authorGender: row.author_gender || '記載なし',
    postedAt: row.posted_at || undefined,
    observedAt: row.observed_at,
    body: row.body || '',
    bodyHash: row.body_hash || '',
    contentKey: row.content_key || '',
  }
}

function duplicateCount(posts: BbsNormalizedPost[]) {
  const keys = new Set<string>()
  let duplicates = 0
  for (const post of posts) {
    const key = `${post.storeId}:${normalizedBbsPostIdentityMaterial({
      articleNo: post.articleNo,
      authorName: post.authorName,
      postedAt: post.postedAt,
      body: post.body,
    })}`
    if (keys.has(key)) duplicates += 1
    else keys.add(key)
  }
  return duplicates
}

export function auditDataQuality(input: DataQualityAuditInput) {
  const referenceAt = new Date(input.referenceAt ?? new Date().toISOString())
  const staleMinutes = input.staleMinutes ?? 180
  const minimumTimestampCoverage = input.minimumTimestampCoverage ?? 90
  const posts = input.posts.map(toPost)
  const structuredPosts = posts.filter(isStructurallyValidCustomerNormalizedPost)
  const rankablePosts = structuredPosts.filter(isRankableCustomerNormalizedPost)
  const malformedPostCount = Math.max(0, posts.length - structuredPosts.length)
  const spamPostCount = posts.filter((post) => isObviousBbsSpamBody(post.body)).length
  const semanticDuplicateCount = duplicateCount(rankablePosts)
  const timestampCoverage = percent(rankablePosts.length, structuredPosts.length)
  const namedPostCount = posts.filter((post) => post.authorName !== '記載なし').length
  const genderedPostCount = posts.filter((post) => post.authorGender !== '記載なし').length
  const sourcePostIds = new Set(rankablePosts.map((post) => post.sourceId).filter(Boolean))

  const sourceAudit = input.sources.map((source) => {
    const fetchedAt = source.last_fetched_at ? new Date(source.last_fetched_at) : null
    const ageMinutes = fetchedAt && !Number.isNaN(fetchedAt.getTime())
      ? Math.max(0, Math.round((referenceAt.getTime() - fetchedAt.getTime()) / 60_000))
      : null
    return {
      id: source.id,
      storeId: source.store_id,
      label: source.label || 'BBS',
      status: source.last_status || 'pending',
      message: source.last_message || null,
      ageMinutes,
      hasCustomerPosts: sourcePostIds.has(source.id),
    }
  })

  const failedSources = sourceAudit.filter((source) => source.status !== 'ok')
  const staleSources = sourceAudit.filter((source) => source.ageMinutes === null || source.ageMinutes > staleMinutes)
  const sourcesWithoutCustomerPosts = sourceAudit.filter((source) => !source.hasCustomerPosts).map((source) => source.storeId)
  const eventWeekdayMismatchCount = input.events.filter(eventTitleWeekdayMismatch).length
  const eventSourceMissingCount = input.events.filter((event) => !event.source_url).length
  const eventUnverifiedStoreIds = input.stores
    .filter((store) => {
      const coverage = input.eventCoverage.find((entry) => entry.storeId === store.id)
      return !coverage || coverage.status === 'unverified'
    })
    .map((store) => store.id)
  const eventVerifiedNoScheduleStoreIds = input.eventCoverage
    .filter((entry) => entry.status === 'none')
    .map((entry) => entry.storeId)
  const addressPrivateStoreIds = input.stores.filter((store) => !store.address).map((store) => store.id)
  const addressPrivateWithoutGuidanceStoreIds = input.stores
    .filter((store) => !store.address && !store.nearest_station)
    .map((store) => store.id)

  const failures: string[] = []
  if (failedSources.length) failures.push(`最終取得状態が正常でない巡回元 ${failedSources.length}件`)
  if (staleSources.length) failures.push(`最終取得から${staleMinutes}分を超えた巡回元 ${staleSources.length}件`)
  if (malformedPostCount) failures.push(`不完全な正規化投稿 ${malformedPostCount}件`)
  if (spamPostCount) failures.push(`広告・スパム候補 ${spamPostCount}件`)
  if (semanticDuplicateCount) failures.push(`意味上同一の投稿 ${semanticDuplicateCount}件`)
  if (structuredPosts.length && timestampCoverage < minimumTimestampCoverage) {
    failures.push(`投稿時刻解析率が${minimumTimestampCoverage}%未満（${timestampCoverage}%）`)
  }
  if (eventWeekdayMismatchCount) failures.push(`イベント日付と曜日の矛盾 ${eventWeekdayMismatchCount}件`)
  if (eventSourceMissingCount) failures.push(`公式URLがないイベント ${eventSourceMissingCount}件`)
  if (addressPrivateWithoutGuidanceStoreIds.length) {
    failures.push(`住所・最寄り駅の案内がない店舗 ${addressPrivateWithoutGuidanceStoreIds.length}件`)
  }

  const warnings: string[] = []
  if (eventUnverifiedStoreIds.length) warnings.push(`当月イベント未確認 ${eventUnverifiedStoreIds.length}店舗`)
  const genderCoverage = percent(genderedPostCount, posts.length)
  if (posts.length && genderCoverage < 60) warnings.push(`性別判定率 ${genderCoverage}%（推測補完なし）`)
  if (sourcesWithoutCustomerPosts.length) warnings.push(`直近48時間の顧客投稿0件 ${sourcesWithoutCustomerPosts.length}店舗`)

  return {
    auditedAt: referenceAt.toISOString(),
    healthy: failures.length === 0,
    failures,
    warnings,
    summary: {
      stores: input.stores.length,
      activeSources: input.sources.length,
      healthySources: input.sources.length - failedSources.length,
      recentSources: input.sources.length - staleSources.length,
      normalizedPosts: posts.length,
      structuredPosts: structuredPosts.length,
      timestampedPosts: rankablePosts.length,
      timestampCoverage,
      authorCoverage: percent(namedPostCount, posts.length),
      genderCoverage,
      semanticDuplicateCount,
      malformedPostCount,
      spamPostCount,
      currentMonthEvents: input.events.length,
      eventVerifiedStores: input.eventCoverage.filter((entry) => entry.status !== 'unverified').length,
      eventUnverifiedStores: eventUnverifiedStoreIds.length,
      addressPrivateStores: addressPrivateStoreIds.length,
      addressPrivateWithGuidanceStores: addressPrivateStoreIds.length - addressPrivateWithoutGuidanceStoreIds.length,
    },
    details: {
      failedSources,
      staleSources,
      sourcesWithoutCustomerPosts,
      eventUnverifiedStoreIds,
      eventVerifiedNoScheduleStoreIds,
      addressPrivateStoreIds,
      addressPrivateWithoutGuidanceStoreIds,
    },
  }
}
