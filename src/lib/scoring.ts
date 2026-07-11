import type {
  BbsNormalizedPost,
  BbsSnapshot,
  BbsSnapshotMetrics,
  EventInput,
  ExactTermMatch,
  ExactTermSearchGroup,
  PostRecord,
  PrMetrics,
  ScoredEvent,
  SignalTone,
  StoreActivityMetrics,
  StoreBbsAnalytics,
  StoreRadarPoint,
  StoreProfile,
  VisitForecast,
  WatchedWordHit,
  WeekdayPostStat,
  WordBookmark,
} from './types'
import { eventWeekday, formatEventDateLabel, parseDateInJapan, weekdayFromDate, weekdayIndexForDateInJapan, weekdayLabels } from './date'

export { weekdayLabels }

const femalePrPattern = /(女性|女の子|女性来店|女性予約|女性無料|女性一人|主婦|人妻|奥様|カップル)/i
const specificityPattern = /(\d+人|\d{1,2}[:時]\d{0,2}|予約|確定|初参加|具体|本日|明日|残り|限定)/i
const eventFemalePattern = /(女性|女の子|女性無料|女性一人|単女|主婦|人妻|奥様|カップル|女子)/i
const eventBeginnerPattern = /(初めて|はじめて|初心者|初参加|初来店|ビギナー)/i
const eventDemandPattern = /(予約|満席|残り|人気|来店予告|参加|募集|歓迎|無料|割引|限定)/i
const eventDetailPattern =
  /(\d{1,2}[:時]\d{0,2}|[0-9０-９,]+\s*円|飲み放題|食べ放題|カラオケ|ゲーム|コス|衣装|浴衣|制服|ドレス|SM|ソフトSM|24H|オープン)/i
const femaleOnlyPattern = /女性/g
const firstVisitPattern = /(初めて|はじめて|初参加|初来店)/g
const comebackPattern = /((\d+|[０-９]+|[一二三四五六七八九十百]+)\s*(年|ヶ月|か月|カ月|月|週間|日)\s*ぶり|久しぶり|以来)/g
const groupVisitPattern = /((\d+|[０-９]+|[二三四五六七八九十]+)\s*人組|二人組|三人組|複数人|友達と|ペア)/g
const emojiPattern = /(\p{Extended_Pictographic}|[\u{1F300}-\u{1FAFF}]|[（(][^（）()]{0,10}[;；:：=xX＾^・ω∀Д▽△_<>><][^（）()]{0,10}[）)])/gu
const femaleAuthorGenderPattern = /(女性|単女|単独女性|女|♀)/i
const maleAuthorGenderPattern = /(男性|単男|単独男性|男|♂)/i
const femalePostAuthorPattern = /(?:投稿者|名前|Name)[:：]?[^\n]{0,36}[（(](?:女性|単女|単独女性|女|♀)[）)]/i
const malePostAuthorPattern = /(?:投稿者|名前|Name)[:：]?[^\n]{0,36}[（(](?:男性|単男|単独男性|男|♂)[）)]/i
const firstVisitRecordPattern = /(初めて|はじめて|初参加|初来店)/i
const groupVisitRecordPattern = /((\d+|[０-９]+|[二三四五六七八九十]+)\s*人(?:組|で)?|二人|三人|複数人|グループ|友達と|連れ|カップル|ペア)/i

export type WatchedTemplateKey = 'female' | 'first' | 'comeback' | 'group' | 'emoji'

export const watchedTemplateRules: ReadonlyArray<{
  key: WatchedTemplateKey
  label: string
  shortLabel: string
  term: string
  severity: WatchedWordHit['severity']
  match: (body: string) => string[]
}> = [
  {
    key: 'female',
    label: '女性のみ',
    shortLabel: '女性',
    term: '女性',
    severity: 'medium',
    match: (body) => [...body.matchAll(femaleOnlyPattern)].map((match) => match[0]),
  },
  {
    key: 'first',
    label: '初めて',
    shortLabel: '初めて',
    term: '初めて',
    severity: 'high',
    match: (body) => [...body.matchAll(firstVisitPattern)].map((match) => match[0]),
  },
  {
    key: 'comeback',
    label: '久しぶり',
    shortLabel: '久しぶり',
    term: '久しぶり',
    severity: 'high',
    match: (body) => [...body.matchAll(comebackPattern)].map((match) => match[0]),
  },
  {
    key: 'group',
    label: '複数人',
    shortLabel: '2人組',
    term: '2人組',
    severity: 'medium',
    match: (body) => [...body.matchAll(groupVisitPattern)].map((match) => match[0]),
  },
  {
    key: 'emoji',
    label: '絵文字/顔文字',
    shortLabel: '絵文字',
    term: 'emoji',
    severity: 'low',
    match: (body) => [...body.matchAll(emojiPattern)].map((match) => match[0] || 'emoji'),
  },
]

export const defaultWatchedTemplateKeys = watchedTemplateRules.map((rule) => rule.key)
export const defaultWatchedWordLabels = watchedTemplateRules.map((rule) => rule.label)

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function scaledSignal(count: number, halfSaturation: number, maxScore: number) {
  if (count <= 0) return 0
  return (count / (count + halfSaturation)) * maxScore
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function normalizeBody(body: string) {
  return body.replace(/\s+/g, '').replace(/[0-9０-９]/g, '0').toLowerCase()
}

function referenceTimeForPosts(posts: PostRecord[]) {
  const latest = posts.reduce((max, post) => {
    const time = new Date(post.postedAt).getTime()
    return Number.isNaN(time) ? max : Math.max(max, time)
  }, 0)

  return latest ? latest + 6 * 60 * 60 * 1000 : Date.UTC(2026, 5, 2, 18, 0, 0)
}

function hoursSince(date: string, now: number) {
  const time = new Date(date).getTime()
  if (Number.isNaN(time)) return 72
  return Math.max(0, (now - time) / (1000 * 60 * 60))
}

export function filterPostsWithinHours(posts: PostRecord[], referenceAt: string | number | Date, hours = 24) {
  const referenceTime =
    referenceAt instanceof Date ? referenceAt.getTime() : typeof referenceAt === 'number' ? referenceAt : new Date(referenceAt).getTime()
  if (!Number.isFinite(referenceTime)) return posts

  const cutoff = referenceTime - hours * 60 * 60 * 1000
  const futureTolerance = referenceTime + 10 * 60 * 1000

  return posts.filter((post) => {
    const postedTime = new Date(post.postedAt).getTime()
    return Number.isFinite(postedTime) && postedTime >= cutoff && postedTime <= futureTolerance
  })
}

function normalizeAuthorName(value: string) {
  const normalized = value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
  return normalized && normalized !== '記載なし' ? normalized : ''
}

function resolvedNormalizedPostGender(post: Pick<BbsNormalizedPost, 'authorName' | 'authorGender'>) {
  if (femaleAuthorGenderPattern.test(post.authorGender)) return 'female'
  if (maleAuthorGenderPattern.test(post.authorGender)) return 'male'

  const author = post.authorName.normalize('NFKC').replace(/\s+/g, '')
  if (/(?:♀|女性|単女|単独女性)$/.test(author)) return 'female'
  if (/(?:♂|男性|単男|単独男性)$/.test(author)) return 'male'
  return 'unknown'
}

function postGenderCounts(posts: PostRecord[], normalizedPosts: BbsNormalizedPost[]) {
  if (normalizedPosts.length) {
    return {
      female: normalizedPosts.filter((post) => resolvedNormalizedPostGender(post) === 'female').length,
      male: normalizedPosts.filter((post) => resolvedNormalizedPostGender(post) === 'male').length,
    }
  }

  return {
    female: posts.filter((post) => femalePostAuthorPattern.test(post.body)).length,
    male: posts.filter((post) => malePostAuthorPattern.test(post.body)).length,
  }
}

export function buildStoreActivityMetrics(input: {
  storeId: string
  businessPosts: PostRecord[]
  normalizedPosts?: BbsNormalizedPost[]
  referenceAt: string | number | Date
}): StoreActivityMetrics {
  const businessPosts = input.businessPosts.filter((post) => post.storeId === input.storeId)
  const businessPostIds = new Set(businessPosts.map((post) => post.id))
  const allNormalizedPosts = (input.normalizedPosts ?? []).filter(
    (post) => post.storeId === input.storeId && isStructurallyValidCustomerNormalizedPost(post),
  )
  const businessNormalizedPosts = allNormalizedPosts.filter((post) => businessPostIds.has(`normalized-${post.id}`))
  const recentThreeHourPosts = filterPostsWithinHours(businessPosts, input.referenceAt, 3)
  const recentThreeHourIds = new Set(recentThreeHourPosts.map((post) => post.id))
  const recentThreeHourNormalizedPosts = businessNormalizedPosts.filter((post) => recentThreeHourIds.has(`normalized-${post.id}`))
  const normalizedByEffectivePostId = new Map(businessNormalizedPosts.map((post) => [`normalized-${post.id}`, post]))
  const gender = postGenderCounts(businessPosts, businessNormalizedPosts)
  const recentGender = postGenderCounts(recentThreeHourPosts, recentThreeHourNormalizedPosts)
  const genderSampleCount = gender.female + gender.male
  const authorNames = businessNormalizedPosts.map((post) => normalizeAuthorName(post.authorName)).filter(Boolean)
  const uniqueAuthors = [...new Set(authorNames)]
  const authorCoverage = businessPosts.length ? clamp((authorNames.length / businessPosts.length) * 100) : 0
  const genderCoverage = businessPosts.length ? clamp((genderSampleCount / businessPosts.length) * 100) : 0
  const referenceTime = referenceTimestamp(input.referenceAt)
  const recentParserPosts = referenceTime === null
    ? allNormalizedPosts
    : allNormalizedPosts.filter((post) => {
        const observedTime = new Date(post.observedAt).getTime()
        return Number.isFinite(observedTime) && observedTime >= referenceTime - 6 * 60 * 60 * 1000 && observedTime <= referenceTime + 10 * 60 * 1000
      })
  const parserCoveragePosts = recentParserPosts.length ? recentParserPosts : allNormalizedPosts
  const timestampCoverage = parserCoveragePosts.length
    ? clamp((parserCoveragePosts.filter((post) => Boolean(post.postedAt)).length / parserCoveragePosts.length) * 100)
    : 0
  const allAuthorCounts = new Map<string, number>()

  allNormalizedPosts.forEach((post) => {
    const name = normalizeAuthorName(post.authorName)
    if (!name) return
    allAuthorCounts.set(name, (allAuthorCounts.get(name) ?? 0) + 1)
  })

  const repeatedAuthors = uniqueAuthors.filter((name) => (allAuthorCounts.get(name) ?? 0) >= 2).length

  return {
    recentPostCount: businessPosts.length,
    recentThreeHourCount: recentThreeHourPosts.length,
    recentThreeHourFemaleCount: recentGender.female,
    femalePostCount: gender.female,
    malePostCount: gender.male,
    genderSampleCount,
    womenRatio: genderSampleCount >= 3 && genderCoverage >= 20 ? clamp((gender.female / genderSampleCount) * 100) : null,
    firstVisitCount: businessPosts.filter((post) => firstVisitRecordPattern.test(post.body)).length,
    groupVisitCount: businessPosts.filter((post) => groupVisitRecordPattern.test(post.body)).length,
    attentionPostCount: businessPosts.filter((post) => {
      const normalizedPost = normalizedByEffectivePostId.get(post.id)
      const isFemale = normalizedPost
        ? resolvedNormalizedPostGender(normalizedPost) === 'female'
        : femalePostAuthorPattern.test(post.body)
      return isFemale || firstVisitRecordPattern.test(post.body) || groupVisitRecordPattern.test(post.body)
    }).length,
    uniqueAuthorCount: uniqueAuthors.length,
    repeatAuthorRatio: uniqueAuthors.length ? clamp((repeatedAuthors / uniqueAuthors.length) * 100) : null,
    normalizedCoverage: businessPosts.length ? clamp((businessNormalizedPosts.length / businessPosts.length) * 100) : 0,
    timestampCoverage,
    authorCoverage,
    genderCoverage,
  }
}

function japanDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0)

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

function japanTimeToUtcTimestamp(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  return Date.UTC(year, month - 1, day, hour - 9, minute, second)
}

type BusinessWindowSource = 'bbs' | 'profile' | 'fallback'

type BusinessTimeRange = {
  label: string
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
  source: BusinessWindowSource
}

type StoreBusinessWindow = BusinessTimeRange & {
  start: number
  end: number
}

function referenceTimestamp(referenceAt: string | number | Date) {
  const referenceTime =
    referenceAt instanceof Date ? referenceAt.getTime() : typeof referenceAt === 'number' ? referenceAt : new Date(referenceAt).getTime()
  return Number.isFinite(referenceTime) ? referenceTime : null
}

function parseClockText(value: string, fallbackHour: number) {
  const normalized = value.normalize('NFKC')
  const match = normalized.match(/([0-3]?\d)\s*(?::|時)\s*([0-5]\d)?/)
  if (!match) return { hour: fallbackHour, minute: 0 }

  return {
    hour: Number(match[1]),
    minute: Number(match[2] ?? 0),
  }
}

function sessionLabelFromText(prefix: string, startHour: number, endHour: number) {
  if (/朝活|朝|早朝/i.test(prefix)) return '朝活'
  if (/昼部|昼の部|昼|day/i.test(prefix)) return '昼部'
  if (/夜部|夜の部|夜|night/i.test(prefix)) return '夜部'
  if (startHour >= 18 || endHour <= 6 || endHour >= 24) return '夜部'
  if (startHour <= 11) return '朝活'
  return '昼部'
}

function timeRangeKey(range: BusinessTimeRange) {
  return `${range.label}:${range.startHour}:${range.startMinute}-${range.endHour}:${range.endMinute}`
}

function pushUniqueRange(ranges: BusinessTimeRange[], range: BusinessTimeRange) {
  const normalizedStart = range.startHour * 60 + range.startMinute
  const normalizedEnd = range.endHour * 60 + range.endMinute
  const duration = normalizedEnd > normalizedStart ? normalizedEnd - normalizedStart : normalizedEnd + 24 * 60 - normalizedStart
  if (duration < 60 || duration > 18 * 60) return

  const existingIndex = ranges.findIndex((item) => timeRangeKey(item) === timeRangeKey(range))
  if (existingIndex === -1) {
    ranges.push(range)
    return
  }

  if (ranges[existingIndex].source !== 'bbs' && range.source === 'bbs') ranges[existingIndex] = range
}

function extractBusinessTimeRangesFromText(text: string): BusinessTimeRange[] {
  const normalized = text.normalize('NFKC').replace(/[〜～]/g, '-')
  const ranges: BusinessTimeRange[] = []
  const businessContextPattern = /(朝活|昼部|夜部|昼の部|夜の部|昼営業|夜営業|営業時間|営業|開店|閉店|オープン|クローズ|open|close)/i
  const pattern =
    /(?:(朝活|昼部|夜部|昼の部|夜の部|昼営業|夜営業|昼|夜|朝|営業時間|営業)[^\d\n\r。]{0,24})?([0-3]?\d)(?::\s*([0-5]\d)|\s*時(?:\s*([0-5]\d)\s*分)?)\s*(?:-|~|から|より|→|ー|―|－)\s*(?:翌)?([0-3]?\d)(?::\s*([0-5]\d)|\s*時(?:\s*([0-5]\d)\s*分)?)/g

  for (const match of normalized.matchAll(pattern)) {
    const prefix = match[1] ?? ''
    const matchIndex = match.index ?? 0
    const context = normalized.slice(Math.max(0, matchIndex - 32), Math.min(normalized.length, matchIndex + match[0].length + 32))
    if (!prefix && !businessContextPattern.test(context)) continue
    const startHour = Number(match[2])
    const startMinute = Number(match[3] ?? match[4] ?? 0)
    const endHour = Number(match[5])
    const endMinute = Number(match[6] ?? match[7] ?? 0)
    if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) continue
    if (startHour > 30 || endHour > 30) continue

    pushUniqueRange(ranges, {
      label: sessionLabelFromText(prefix, startHour, endHour),
      startHour,
      startMinute,
      endHour,
      endMinute,
      source: 'bbs',
    })
  }

  return ranges
}

function businessTimeRangesFromStore(store: StoreProfile): BusinessTimeRange[] {
  const ranges: BusinessTimeRange[] = []

  if (store.hasDaytime) {
    const start = parseClockText(store.openingHourDay, 13)
    pushUniqueRange(ranges, {
      label: start.hour <= 11 ? '朝活' : '昼部',
      startHour: start.hour,
      startMinute: start.minute,
      endHour: 19,
      endMinute: 0,
      source: 'profile',
    })
  }

  if (store.hasNight) {
    const start = parseClockText(store.openingHourNight, 19)
    pushUniqueRange(ranges, {
      label: '夜部',
      startHour: start.hour,
      startMinute: start.minute,
      endHour: 5,
      endMinute: 0,
      source: 'profile',
    })
  }

  if (!ranges.length) {
    pushUniqueRange(ranges, {
      label: '夜部',
      startHour: 19,
      startMinute: 0,
      endHour: 5,
      endMinute: 0,
      source: 'fallback',
    })
  }

  return ranges
}

function storeBusinessRanges(store: StoreProfile, contextTexts: string[] = []) {
  const bbsRanges: BusinessTimeRange[] = []
  contextTexts.slice(0, 24).forEach((text) => {
    extractBusinessTimeRangesFromText(text).forEach((range) => pushUniqueRange(bbsRanges, range))
  })
  if (bbsRanges.length) {
    const firstRangeByLabel = new Map<string, BusinessTimeRange>()
    bbsRanges.forEach((range) => {
      if (!firstRangeByLabel.has(range.label)) firstRangeByLabel.set(range.label, range)
    })
    return [...firstRangeByLabel.values()]
  }

  const ranges: BusinessTimeRange[] = []
  businessTimeRangesFromStore(store).forEach((range) => pushUniqueRange(ranges, range))
  return ranges
}

function addDaysToJapanParts(parts: ReturnType<typeof japanDateParts>, days: number) {
  const shifted = new Date(japanTimeToUtcTimestamp(parts.year, parts.month, parts.day + days, 12))
  return japanDateParts(shifted)
}

function windowFromRange(parts: ReturnType<typeof japanDateParts>, range: BusinessTimeRange): StoreBusinessWindow {
  const start = japanTimeToUtcTimestamp(parts.year, parts.month, parts.day, range.startHour, range.startMinute)
  let end = japanTimeToUtcTimestamp(parts.year, parts.month, parts.day, range.endHour, range.endMinute)
  if (end <= start) end += 24 * 60 * 60 * 1000
  return { ...range, start, end }
}

export function inferStoreBusinessWindows(
  store: StoreProfile,
  referenceAt: string | number | Date,
  contextTexts: string[] = [],
): StoreBusinessWindow[] {
  const referenceTime = referenceTimestamp(referenceAt)
  if (referenceTime === null) return []

  const baseParts = japanDateParts(new Date(referenceTime))
  const ranges = storeBusinessRanges(store, contextTexts)
  const windows = [-1, 0, 1]
    .flatMap((offset) => ranges.map((range) => windowFromRange(addDaysToJapanParts(baseParts, offset), range)))
    .sort((left, right) => left.start - right.start)
  const futureTolerance = referenceTime + 10 * 60 * 1000
  const activeWindows = windows.filter((window) => window.start <= futureTolerance && referenceTime <= window.end)
  if (activeWindows.length) return activeWindows

  const startedWindows = windows.filter((window) => window.start <= futureTolerance)
  if (startedWindows.length) {
    const latestStart = Math.max(...startedWindows.map((window) => window.start))
    return startedWindows.filter((window) => window.start === latestStart)
  }

  const nextWindow = windows.find((window) => window.start > referenceTime)
  return nextWindow ? [nextWindow] : windows.slice(-1)
}

export function isStoreWithinBusinessHours(
  store: StoreProfile,
  referenceAt: string | number | Date,
  contextTexts: string[] = [],
) {
  const referenceTime = referenceTimestamp(referenceAt)
  if (referenceTime === null) return false
  return inferStoreBusinessWindows(store, referenceAt, contextTexts).some(
    (window) => window.start <= referenceTime && referenceTime <= window.end,
  )
}

function contextTextsForStore(storeId: string, posts: PostRecord[], snapshots: BbsSnapshot[]) {
  const postTexts = posts
    .filter((post) => post.storeId === storeId)
    .sort((left, right) => new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime())
    .slice(0, 12)
    .map((post) => post.body)
  const snapshotTexts = snapshots
    .filter((snapshot) => snapshot.storeId === storeId)
    .sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime())
    .slice(0, 6)
    .map((snapshot) => snapshot.extractedText)

  return [...snapshotTexts, ...postTexts]
}

function isWithinAnyBusinessWindow(time: number, windows: StoreBusinessWindow[]) {
  return Number.isFinite(time) && windows.some((window) => time >= window.start && time <= window.end)
}

export function filterPostsForStoreBusinessWindows(
  posts: PostRecord[],
  stores: StoreProfile[],
  referenceAt: string | number | Date,
  snapshots: BbsSnapshot[] = [],
  contextPosts: PostRecord[] = posts,
) {
  const referenceTime = referenceTimestamp(referenceAt)
  if (referenceTime === null) return posts
  const futureTolerance = referenceTime + 10 * 60 * 1000
  const storeById = new Map(stores.map((store) => [store.id, store]))
  const windowsByStore = new Map<string, StoreBusinessWindow[]>()

  return posts.filter((post) => {
    const store = storeById.get(post.storeId)
    if (!store) return false
    const postedTime = new Date(post.postedAt).getTime()
    if (!Number.isFinite(postedTime) || postedTime > futureTolerance) return false
    if (!windowsByStore.has(store.id)) {
      windowsByStore.set(store.id, inferStoreBusinessWindows(store, referenceAt, contextTextsForStore(store.id, contextPosts, snapshots)))
    }
    return isWithinAnyBusinessWindow(postedTime, windowsByStore.get(store.id) ?? [])
  })
}

export function filterSnapshotsForStoreBusinessWindows(
  snapshots: BbsSnapshot[],
  stores: StoreProfile[],
  referenceAt: string | number | Date,
  contextPosts: PostRecord[] = [],
) {
  const referenceTime = referenceTimestamp(referenceAt)
  if (referenceTime === null) return snapshots
  const futureTolerance = referenceTime + 10 * 60 * 1000
  const storeById = new Map(stores.map((store) => [store.id, store]))
  const windowsByStore = new Map<string, StoreBusinessWindow[]>()

  return snapshots.filter((snapshot) => {
    const store = storeById.get(snapshot.storeId)
    if (!store) return false
    const capturedTime = new Date(snapshot.capturedAt).getTime()
    if (!Number.isFinite(capturedTime) || capturedTime > futureTolerance) return false
    if (!windowsByStore.has(store.id)) {
      windowsByStore.set(store.id, inferStoreBusinessWindows(store, referenceAt, contextTextsForStore(store.id, contextPosts, snapshots)))
    }
    return isWithinAnyBusinessWindow(capturedTime, windowsByStore.get(store.id) ?? [])
  })
}

export function businessDayRangeInJapan(referenceAt: string | number | Date) {
  const referenceTime = referenceTimestamp(referenceAt)
  if (referenceTime === null) return null

  const parts = japanDateParts(new Date(referenceTime))
  let start = japanTimeToUtcTimestamp(parts.year, parts.month, parts.day, 6)
  if (parts.hour < 6) start -= 24 * 60 * 60 * 1000

  return {
    start,
    end: start + 24 * 60 * 60 * 1000,
    referenceTime,
  }
}

export function filterPostsForBusinessDay(posts: PostRecord[], referenceAt: string | number | Date) {
  const range = businessDayRangeInJapan(referenceAt)
  if (!range) return posts

  const futureTolerance = Math.min(range.end, range.referenceTime + 10 * 60 * 1000)

  return posts.filter((post) => {
    const postedTime = new Date(post.postedAt).getTime()
    return Number.isFinite(postedTime) && postedTime >= range.start && postedTime <= futureTolerance
  })
}

function japanCalendarDateKey(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function shiftJapanDateKey(dateKey: string, days: number) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return dateKey
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days, 12))
  return japanCalendarDateKey(shifted) ?? dateKey
}

export function decisionDateKeyInJapan(referenceAt: string | number | Date) {
  const range = businessDayRangeInJapan(referenceAt)
  return range ? japanCalendarDateKey(range.start) : null
}

const cancelledVisitPattern = /(行けなくな|行けません|行きません|伺えません|伺いません|キャンセル|中止にし|取りやめ|見送ります)/i

function explicitTargetDateKey(body: string, postedAt: string) {
  const normalized = body.normalize('NFKC')
  const full = normalized.match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})日?/)
  const short = full ? null : normalized.match(/(?:^|\D)(\d{1,2})[月./-](\d{1,2})日?(?:\D|$)/)
  const postedParts = japanDateParts(new Date(postedAt))
  const year = full ? Number(full[1]) : postedParts.year
  const month = Number(full?.[2] ?? short?.[1])
  const day = Number(full?.[3] ?? short?.[2])
  if (!month || !day) return null

  const date = new Date(Date.UTC(year, month - 1, day, 12))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function postDecisionDateKey(post: PostRecord) {
  const markedDate = post.keywords.find((keyword) => keyword.startsWith('target-date:'))?.slice('target-date:'.length)
  if (markedDate && /^\d{4}-\d{2}-\d{2}$/.test(markedDate)) return markedDate

  const body = post.body.normalize('NFKC')
  if (cancelledVisitPattern.test(body)) return null

  const explicitDate = explicitTargetDateKey(body, post.postedAt)
  if (explicitDate) return explicitDate

  const postedCalendarDate = japanCalendarDateKey(post.postedAt)
  if (!postedCalendarDate) return null
  if (/明後日/.test(body)) return shiftJapanDateKey(postedCalendarDate, 2)
  if (/明日/.test(body)) return shiftJapanDateKey(postedCalendarDate, 1)
  if (/(今日|本日|今夜|今晩)/.test(body)) return postedCalendarDate

  const range = businessDayRangeInJapan(post.postedAt)
  return range ? japanCalendarDateKey(range.start) : postedCalendarDate
}

export function filterPostsForDecisionDate(posts: PostRecord[], referenceAt: string | number | Date) {
  const targetDate = decisionDateKeyInJapan(referenceAt)
  const referenceTime = referenceTimestamp(referenceAt)
  if (!targetDate || referenceTime === null) return posts
  const futureTolerance = referenceTime + 10 * 60 * 1000

  return posts.filter((post) => {
    const postedTime = new Date(post.postedAt).getTime()
    return Number.isFinite(postedTime) && postedTime <= futureTolerance && postDecisionDateKey(post) === targetDate
  })
}

export function filterSnapshotsForBusinessDay(snapshots: BbsSnapshot[], referenceAt: string | number | Date) {
  const range = businessDayRangeInJapan(referenceAt)
  if (!range) return snapshots

  const futureTolerance = Math.min(range.end, range.referenceTime + 10 * 60 * 1000)

  return snapshots.filter((snapshot) => {
    const capturedTime = new Date(snapshot.capturedAt).getTime()
    return Number.isFinite(capturedTime) && capturedTime >= range.start && capturedTime <= futureTolerance
  })
}

export function normalizeWatchedSearchText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function normalizedMatchIndex(body: string, term: string) {
  const normalizedTerm = normalizeWatchedSearchText(term)
  if (!normalizedTerm) return -1

  let normalizedBody = ''
  const rawIndices: number[] = []
  let rawIndex = 0

  for (const character of body) {
    const normalizedCharacter = normalizeWatchedSearchText(character)
    for (let index = 0; index < normalizedCharacter.length; index += 1) {
      rawIndices.push(rawIndex)
    }
    normalizedBody += normalizedCharacter
    rawIndex += character.length
  }

  const normalizedIndex = normalizedBody.indexOf(normalizedTerm)
  return normalizedIndex >= 0 ? (rawIndices[normalizedIndex] ?? -1) : -1
}

function buildSnippet(body: string, term: string) {
  const exactIndex = body.indexOf(term)
  const index = exactIndex >= 0 ? exactIndex : normalizedMatchIndex(body, term)
  if (index < 0) return body.slice(0, 90)
  const start = Math.max(0, index - 32)
  const end = Math.min(body.length, index + term.length + 42)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < body.length ? '…' : ''
  return `${prefix}${body.slice(start, end)}${suffix}`
}

export type WatchedAuthorEntry = {
  name: string
  gender: string
  body: string
  authorText: string
}

const watchedGenderToken = '女性|男性|単女|単男|女|男|♀|♂|カップル|ペア|複数'
const watchedGenderPattern = new RegExp(`^(${watchedGenderToken})$`, 'i')

function cleanAuthorNameText(value: string) {
  return value
    .replace(/^投稿者[:：]\s*/, '')
    .replace(/^名前[:：]\s*/i, '')
    .replace(/^Name[:：]\s*/i, '')
    .replace(/^削除\s*/, '')
    .replace(/^返信[:：]?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeWatchedGender(value: string) {
  const normalized = value.replace(/\s+/g, '').trim()
  if (/(女性|単女|女|♀)/i.test(normalized)) return '女性'
  if (/(男性|単男|男|♂)/i.test(normalized)) return '男性'
  if (/(カップル|ペア|複数)/i.test(normalized)) return '複数'
  return '記載なし'
}

function cleanEmbeddedAuthorName(value: string) {
  let name = cleanAuthorNameText(value)
    .replace(new RegExp(`[（(]\\s*(?:${watchedGenderToken})\\s*[）)].*$`, 'i'), '')
    .replace(/[「」『』【】[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const separatorParts = name.split(/[。！？!?、,♪]+/).map((part) => part.trim()).filter(Boolean)
  if (separatorParts.length) name = separatorParts.at(-1) ?? name

  name = name.replace(/^.*(?:かな|かも|ます|です|でした|して|から|行こう|行く|行き|伺い|お邪魔)(?=[^\s（）()]{1,8}$)/, '')
  if (/^かな[^\s（）()]{1,6}$/.test(name)) name = name.slice(2)

  return name.replace(/\s+/g, ' ').trim()
}

function createWatchedAuthorEntry(name: string, gender: string, body = ''): WatchedAuthorEntry | null {
  const cleanedName = cleanEmbeddedAuthorName(name)
  if (!cleanedName) return null
  if (/^(投稿者|名前|Name|記事番号|No\.?|Re|返信|削除)$/i.test(cleanedName)) return null
  if (cleanedName.length > 36) return null

  const normalizedGender = normalizeWatchedGender(gender)
  const cleanedBody = body
    .replace(/^削除\s*/, '')
    .replace(/\s*(?:投稿日|投稿日時?|書き込み日時?)[:：]?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const authorText = [cleanedName, normalizedGender === '記載なし' ? '' : normalizedGender].filter(Boolean).join(' ')

  return {
    name: cleanedName,
    gender: normalizedGender,
    body: cleanedBody,
    authorText,
  }
}

function splitAuthorPayload(value: string) {
  const raw = value.replace(/\s+/g, ' ').trim()
  const genderMatch = raw.match(new RegExp(`^(.{1,40}?)\\s*[（(]\\s*(${watchedGenderToken})\\s*[）)]\\s*(.*)$`, 'i'))
  if (genderMatch) {
    return createWatchedAuthorEntry(genderMatch[1] ?? '', genderMatch[2] ?? '', genderMatch[3] ?? '')
  }

  const contentStart = raw.search(
    /\s(?=初めて|はじめて|久しぶり|今日|本日|明日|朝|昼|夜|行き|行く|伺|お邪魔|予定|よろしく|誰か|どなた|女性です|男性です|単男です|単女です|[0-9０-９]{1,2}\s*(?:時|:))/,
  )
  const name = contentStart >= 0 ? raw.slice(0, contentStart) : raw
  const body = contentStart >= 0 ? raw.slice(contentStart) : ''
  return createWatchedAuthorEntry(name, '', body)
}

function extractTrailingAuthorEntry(value: string) {
  const match = value.match(/(?:^|\s)([^()\s\u3000]+(?:\s*さん)?)\s*[（(]([^（）()]{2,24})[）)]\s*$/)
  if (!match) return null
  const rawGender = match[2] ?? ''
  const gender = watchedGenderPattern.test(rawGender) ? rawGender : ''
  return createWatchedAuthorEntry(match[1] ?? '', gender, value.slice(0, match.index).replace(/^(記事番号[:：]?\s*\d+|No[.\s]*\d+\)?)/i, ''))
}

function extractEmbeddedAuthorEntries(line: string) {
  const pattern = new RegExp(`([^\\s（）()]{1,28})\\s*[（(]\\s*(${watchedGenderToken})\\s*[）)]`, 'gi')
  const matches = [...line.matchAll(pattern)]
  return matches
    .map((match, index) => {
      const start = (match.index ?? 0) + match[0].length
      const end = matches[index + 1]?.index ?? line.length
      return createWatchedAuthorEntry(match[1] ?? '', match[2] ?? '', line.slice(start, end))
    })
    .filter((entry): entry is WatchedAuthorEntry => Boolean(entry))
}

export function extractWatchedAuthorEntries(value: string) {
  const lines = value
    .replace(/\r\n?/g, '\n')
    .replace(/(投稿者[:：])/g, '\n$1')
    .replace(/(名前[:：]|Name[:：])/gi, '\n$1')
    .replace(/(記事番号[:：]?\s*\d+|No[.\s]*\d+\)?)/gi, '\n$1')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const entries: WatchedAuthorEntry[] = []
  const seen = new Set<string>()
  const addEntry = (entry: WatchedAuthorEntry | null) => {
    if (!entry) return
    const key = `${entry.name}:${entry.gender}:${entry.body.slice(0, 80)}`
    if (seen.has(key)) return
    seen.add(key)
    entries.push(entry)
  }

  lines.forEach((line) => {
    if (/^投稿者[:：]/.test(line)) {
      addEntry(splitAuthorPayload(line.replace(/^投稿者[:：]\s*/, '')))
      return
    }

    if (/^(名前[:：]|Name[:：])/i.test(line)) {
      addEntry(splitAuthorPayload(line.replace(/^(名前[:：]|Name[:：])\s*/i, '')))
      return
    }

    if (/^(記事番号[:：]?\s*\d+|No[.\s]*\d+\)?)/i.test(line)) {
      addEntry(extractTrailingAuthorEntry(line))
      extractEmbeddedAuthorEntries(line).forEach(addEntry)
      return
    }

    extractEmbeddedAuthorEntries(line).forEach(addEntry)
  })

  return entries
}

export function extractWatchedAuthorText(value: string) {
  return extractWatchedAuthorEntries(value)
    .map((entry) => entry.authorText)
    .filter(Boolean)
    .join('\n')
}

function normalizeExactSearchText(value: string) {
  return normalizeWatchedSearchText(value)
}

function includesExactTerm(body: string, term: string) {
  if (body.includes(term)) return true
  const normalizedTerm = normalizeExactSearchText(term)
  if (!normalizedTerm) return false
  return normalizeExactSearchText(body).includes(normalizedTerm)
}

const bbsBlockBreakPattern =
  /(投稿者[:：]|投稿日時?[:：]|投稿日[:：]|書き込み[:：]|記事番号[:：]?|No[.\s]*\d+|Re[:：]|返信[:：]|名前[:：]|Name[:：]|20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}日?)/g
const customerAuthorPattern = /(投稿者[:：]\s*(?!当店|店舗|店|スタッフ|管理|運営|公式|SystemS|システム)|名前[:：]|Name[:：]|No[.\s]*\d+|記事番号|Re[:：])/i
const customerIntentPattern =
  /(行きます|行く|行こう|伺い|お邪魔|います|居ます|予定|誰か|どなた|一緒|初めて|はじめて|久しぶり|よろしく|楽しみ|乾杯|飲み|会え|話し|遊び|参加|人組|友達と|単男|単女|女性です|男性です|女です|男です|初心者|初参加|初来店)/i
const storeSpeakerPattern = /^(投稿者[:：]\s*)?(当店|店舗|店|スタッフ|管理|運営|公式|SystemS|システム|お店|店長|オーナー|マスター|キャスト|受付|事務局)/i
const storeNoticePattern =
  /(禁止事項|免責事項|当掲示板|掲示板のご利用|ルールを守って|投稿の前に|管理者の判断|ご遠慮|当店|料金|入場料|登録手数料|営業時間|営業開始|営業終了|イベント|キャンペーン|お知らせ|告知|無料|割引|問い合わせ|ご質問|セキュリティ|トラブル|利用規約|アクセスブロック|責任|掲載|スタッフ|店内|システム|入会金|年会費|規約|ご来店予告|本日の来店予告)/i
const storeSchedulePattern =
  /(【\s*(昼|夜)\s*の\s*部\s*】|(昼|夜)\s*の\s*部|[0-9０-９]{1,2}\s*(時|:)\s*(〜|~|-|から)\s*[0-9０-９]{1,2}\s*(時|:)|営業時間|営業開始|営業終了)/i
const storeCommercialPattern =
  /(料金|入場料|入会金|登録手数料|無料|割引|半額|[0-9０-９,]+\s*円|タカカード|プレゼント|特典|飲み放題|フリードリンク|カクテル|ハウスボトル|レディース\s*(day|デー)|ニップレス|キャンペーン|イベント開催|本日のイベント|ご新規|新規様|お客様|お待ちしております|お待ちしてます)/i

function compactBbsBlock(value: string) {
  return value.replace(/[ \t\u3000]+/g, ' ').trim()
}

function splitBbsBlocks(value: string) {
  const prepared = value
    .replace(/\r\n?/g, '\n')
    .replace(bbsBlockBreakPattern, '\n$1')
    .replace(/([。！？!?])\s*(?=(投稿者[:：]|No[.\s]*\d+|記事番号[:：]?|Re[:：]|20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}日?))/g, '$1\n')

  return prepared
    .split(/\n+/)
    .map(compactBbsBlock)
    .filter((block) => block.length >= 8)
}

function isLikelyStoreAnnouncementBlock(block: string) {
  if (storeSpeakerPattern.test(block)) return true
  if (/掲示板投稿の前|管理者の判断.{0,80}削除|ルールを守って掲示板/i.test(block)) return true

  const hasSchedule = storeSchedulePattern.test(block)
  const hasCommercialCopy = storeCommercialPattern.test(block)
  const hasNotice = storeNoticePattern.test(block)
  if (hasSchedule && (hasCommercialCopy || hasNotice)) return true
  if (hasCommercialCopy && /ご来店|ご入店|お越し|お待ち|開催|挑戦|特典|プレゼント|料金|入場料|登録手数料/i.test(block)) return true

  return false
}

function isLikelyCustomerBbsBlock(block: string) {
  const normalized = compactBbsBlock(block)
  if (!normalized) return false
  if (isLikelyStoreAnnouncementBlock(normalized)) return false

  const hasCustomerAuthor = customerAuthorPattern.test(normalized)
  const hasCustomerIntent = customerIntentPattern.test(normalized)
  if (!hasCustomerAuthor && !hasCustomerIntent) return false

  const hasStoreNotice = storeNoticePattern.test(normalized)
  if (hasStoreNotice && !hasCustomerIntent) return false

  return hasCustomerAuthor || !hasStoreNotice
}

export function extractCustomerBbsText(value: string) {
  const blocks = splitBbsBlocks(value)
  return blocks.filter(isLikelyCustomerBbsBlock).join('\n\n')
}

export type ExtractedBbsNormalizedPost = Pick<
  BbsNormalizedPost,
  'articleNo' | 'authorName' | 'authorGender' | 'postedAt' | 'body'
>

function parseBbsArticleNo(value: string) {
  return value.match(/(?:記事番号|記事ID)[:：]?\s*([A-Za-z0-9_-]{1,})|No[.\s]*(\d{1,})/i)?.slice(1).find(Boolean)
}

const bbsPostMetaOnlyPattern = /(?:記事番号[:：]?\s*\d{3,}|No[.\s]*\d{3,}|投稿日時?|投稿日|書き込み日時?|20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}|\d{1,2}[月/-]\d{1,2})/i
const bbsExplicitAuthorPattern = /(投稿者[:：]\s*(?!当店|店舗|店|スタッフ|管理|運営|公式|SystemS|システム)|名前[:：]|Name[:：])/i

const canonicalBbsPostPattern = /\[\[NR_POST\]\]([\s\S]*?)\[\[\/NR_POST\]\]/g
const absoluteBbsDateSource =
  '(20\\d{2})(?:年|[./-])\\s*(\\d{1,2})(?:月|[./-])\\s*(\\d{1,2})日?(?:\\([^)]+\\))?\\s*(\\d{1,2})(?:[:：時]\\s*(\\d{1,2}))(?::(\\d{1,2}))?\\s*(AM|PM)?'
const shortBbsDateSource =
  '(\\d{1,2})(?:月|[./-])\\s*(\\d{1,2})日?(?:\\([^)]+\\))?\\s*(\\d{1,2})(?:[:：時]\\s*(\\d{1,2}))(?::(\\d{1,2}))?\\s*(AM|PM)?'

function normalizeBbsDateText(value: string) {
  return value.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
}

function parseBbsPostedAt(value: string, observedAt: string) {
  const observedDate = new Date(observedAt)
  const normalized = normalizeBbsDateText(value)
  const safeObservedDate = Number.isNaN(observedDate.getTime()) ? new Date() : observedDate
  const validatedTimestamp = (date: Date) => {
    const timestamp = date.getTime()
    if (!Number.isFinite(timestamp)) return undefined
    if (timestamp > safeObservedDate.getTime() + 10 * 60_000) return undefined
    return date.toISOString()
  }

  const dayHourMinute = normalized.match(/(\d+)\s*日(?:、|,)?\s*(\d+)\s*時間(?:、|,)?\s*(\d+)\s*分前/)
  const hourMinute = normalized.match(/(\d+)\s*時間(?:、|,)?\s*(\d+)\s*分前/)
  const minuteOnly = normalized.match(/(\d+)\s*分前/)
  if (dayHourMinute) {
    return validatedTimestamp(new Date(
      safeObservedDate.getTime() -
        (Number(dayHourMinute[1]) * 24 * 60 + Number(dayHourMinute[2]) * 60 + Number(dayHourMinute[3])) * 60_000,
    ))
  }
  if (hourMinute) {
    return validatedTimestamp(new Date(
      safeObservedDate.getTime() - (Number(hourMinute[1]) * 60 + Number(hourMinute[2])) * 60_000,
    ))
  }
  if (minuteOnly) return validatedTimestamp(new Date(safeObservedDate.getTime() - Number(minuteOnly[1]) * 60_000))
  if (/たった今|数秒前/.test(normalized)) return validatedTimestamp(safeObservedDate)

  const monthFirstMatch = normalized.match(
    /(\d{1,2})月\s*(\d{1,2}),?\s*(20\d{2})\s*(\d{1,2}):(\d{1,2})\s*(AM|PM)/i,
  )
  if (monthFirstMatch) {
    const month = Number(monthFirstMatch[1])
    const day = Number(monthFirstMatch[2])
    const year = Number(monthFirstMatch[3])
    let hour = Number(monthFirstMatch[4])
    const minute = Number(monthFirstMatch[5])
    const meridiem = String(monthFirstMatch[6]).toUpperCase()
    if (meridiem === 'PM' && hour < 12) hour += 12
    if (meridiem === 'AM' && hour === 12) hour = 0
    const date = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0))
    return validatedTimestamp(date)
  }

  const fallbackYear = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(safeObservedDate),
  )
  const fullDateMatch = normalized.match(new RegExp(absoluteBbsDateSource, 'i'))
  const shortDateMatch = fullDateMatch ?? normalized.match(new RegExp(shortBbsDateSource, 'i'))
  if (!shortDateMatch) return undefined

  const hasYear = /^20\d{2}$/.test(shortDateMatch[1] ?? '')
  const year = hasYear ? Number(shortDateMatch[1]) : fallbackYear
  const month = Number(shortDateMatch[hasYear ? 2 : 1])
  const day = Number(shortDateMatch[hasYear ? 3 : 2])
  let hour = Number(shortDateMatch[hasYear ? 4 : 3])
  const minute = Number(shortDateMatch[hasYear ? 5 : 4])
  const meridiem = String(shortDateMatch[hasYear ? 7 : 6] ?? '').toUpperCase()
  if (meridiem === 'PM' && hour < 12) hour += 12
  if (meridiem === 'AM' && hour === 12) hour = 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (
    ![year, month, day, hour, minute].every(Number.isFinite) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) return undefined

  const date = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0))
  return validatedTimestamp(date)
}

function cleanNormalizedBbsPostBody(block: string, entry: WatchedAuthorEntry | null, articleNo?: string) {
  const authorName = entry?.name ? entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
  const genderToken = entry?.gender && entry.gender !== '記載なし' ? entry.gender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
  let body = entry?.body?.trim() || block

  body = body
    .replace(/\[\[\/?NR_POST\]\]/g, ' ')
    .replace(/(?:記事番号|記事ID)[:：]?\s*[A-Za-z0-9_-]{1,}\)?/gi, ' ')
    .replace(/No[.\s]*\d{1,}\)?/gi, ' ')
    .replace(/(?:投稿日時?|投稿日|書き込み日時?)[:：]?\s*20\d{2}[年/-]\s*\d{1,2}[月/-]\s*\d{1,2}日?(?:\([^)]+\))?\s*\d{0,2}(?:[:：時]\s*\d{0,2})?(?::\d{1,2})?/g, ' ')
    .replace(/(?:投稿日時?|投稿日|書き込み日時?)[:：]?\s*\d{1,2}[月/-]\s*\d{1,2}日?(?:\([^)]+\))?\s*\d{0,2}(?:[:：時]\s*\d{0,2})?(?::\d{1,2})?/g, ' ')
    .replace(/対象日[:：]?\s*\d{4}-\d{2}-\d{2}/g, ' ')
    .replace(/^投稿者[:：]\s*/i, ' ')
    .replace(/^名前[:：]\s*/i, ' ')
    .replace(/^Name[:：]\s*/i, ' ')
    .replace(/^Re[:：]?\s*/i, ' ')
    .replace(/^返信[:：]?\s*/i, ' ')
    .replace(/^削除\s*/, ' ')

  body = body.trim()

  if (authorName && genderToken) {
    body = body.replace(new RegExp(`^${authorName}\\s*[（(]\\s*${genderToken}\\s*[）)]\\s*`, 'i'), ' ')
  }
  if (authorName) body = body.replace(new RegExp(`^${authorName}\\s*`, 'i'), ' ')
  if (genderToken) body = body.replace(new RegExp(`^[（(]\\s*${genderToken}\\s*[）)]\\s*`, 'i'), ' ')
  if (articleNo) body = body.replace(new RegExp(`^${articleNo}\\)?\\s*`, 'i'), ' ')

  return body.replace(/\s+/g, ' ').trim()
}

function extractCanonicalAuthorEntry(block: string): WatchedAuthorEntry | null {
  const rawAuthor = block.match(/^投稿者[:：]\s*(.+)$/m)?.[1]?.trim()
  if (!rawAuthor) return null
  const genderMatch = rawAuthor.match(new RegExp(`^(.{1,80}?)\\s*[（(]\\s*(${watchedGenderToken})\\s*[）)]\\s*(.*)$`, 'i'))
  const contentStart = genderMatch
    ? -1
    : rawAuthor.search(
        /\s(?=初めて|はじめて|久しぶり|今日|本日|明日|朝|昼|夜|行き|行く|伺|お邪魔|予定|よろしく|誰か|どなた|女性です|男性です|単男です|単女です|[0-9０-９]{1,2}\s*(?:時|:))/,
      )
  const name = cleanAuthorNameText(genderMatch?.[1] ?? (contentStart >= 0 ? rawAuthor.slice(0, contentStart) : rawAuthor))
  const gender = normalizeWatchedGender(genderMatch?.[2] ?? '')
  const body = (genderMatch?.[3] ?? (contentStart >= 0 ? rawAuthor.slice(contentStart) : ''))
    .replace(/\s*(?:投稿日|投稿日時?|書き込み日時?)[:：]?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name || name.length > 80) return null

  return {
    name,
    gender,
    body,
    authorText: [name, gender === '記載なし' ? '' : gender].filter(Boolean).join(' '),
  }
}

export function extractNormalizedBbsPostsFromText(value: string, observedAt: string): ExtractedBbsNormalizedPost[] {
  const canonicalBlocks = [...value.matchAll(canonicalBbsPostPattern)].map((match) => match[1]?.trim()).filter(Boolean) as string[]
  const trailingMetadataPattern = new RegExp(
    `(?:投稿者|名前|Name)[:：]\\s*([\\s\\S]{2,2200}?)\\s+(?:投稿日|投稿日時?|書き込み日時?)[:：]?\\s*(${absoluteBbsDateSource})(?:\\s+記事番号[:：]?\\s*(\\d{3,}))?`,
    'gi',
  )
  const structuredBlocks = canonicalBlocks.length
    ? canonicalBlocks
    : [...value.matchAll(trailingMetadataPattern)].map((match) => {
        const articleNo = match.at(-1)
        return [
          `投稿者： ${match[1] ?? ''}`,
          `投稿日： ${match[2] ?? ''}`,
          articleNo ? `記事番号： ${articleNo}` : '',
        ].filter(Boolean).join(' ')
      })

  const blocks: string[] = []
  let pendingMeta = ''
  if (structuredBlocks.length) {
    structuredBlocks.forEach((block) => {
      if (isLikelyCustomerBbsBlock(block)) blocks.push(block)
    })
  }
  if (!blocks.length) {
    splitBbsBlocks(value).forEach((block) => {
      const isMetaOnly = bbsPostMetaOnlyPattern.test(block) && !bbsExplicitAuthorPattern.test(block) && !customerIntentPattern.test(block)
      if (isMetaOnly) {
        pendingMeta = [pendingMeta, block].filter(Boolean).join(' ')
        return
      }

      const combined = [pendingMeta, block].filter(Boolean).join(' ').trim()
      pendingMeta = ''
      if (isLikelyCustomerBbsBlock(combined)) blocks.push(combined)
    })
  }
  const seen = new Set<string>()
  const posts: ExtractedBbsNormalizedPost[] = []

  blocks.forEach((block) => {
    const articleNo = parseBbsArticleNo(block)
    const entry = extractCanonicalAuthorEntry(block) ?? extractWatchedAuthorEntries(block)[0] ?? null
    const authorName = entry?.name?.trim() || '記載なし'
    const parsedGender = entry?.gender || '記載なし'
    const inferredGender = resolvedNormalizedPostGender({ authorName, authorGender: parsedGender })
    const authorGender = inferredGender === 'female' ? '女性' : inferredGender === 'male' ? '男性' : parsedGender
    const targetDate = block.match(/対象日[:：]?\s*(\d{4}-\d{2}-\d{2})/)?.[1]
    const cleanBody = cleanNormalizedBbsPostBody(block, entry, articleNo)
    const body = targetDate ? `[[NR_TARGET_DATE:${targetDate}]] ${cleanBody}` : cleanBody
    const postedAt = parseBbsPostedAt(block, observedAt)

    if (body.length < 2) return
    const key = articleNo ? `article:${articleNo}` : `${authorName}:${authorGender}:${body.slice(0, 140)}`
    if (seen.has(key)) return
    seen.add(key)

    const post: ExtractedBbsNormalizedPost = {
      authorName,
      authorGender,
      body,
    }
    if (articleNo) post.articleNo = articleNo
    if (postedAt) post.postedAt = postedAt
    posts.push(post)
  })

  return posts
}

const automatedStoreReplyPattern =
  /(書き込みありがとうございます|予告メッセージありがとうございます|ご来店をスタッフ一同楽しみに|thank you for posting your visit notice|look forward to welcoming)/i
const storeAuthoredContentPattern =
  /(本日.{0,40}(?:昼|夜).{0,12}部|営業時間|営業開始|営業終了|イベント(?:開催|情報|のお知らせ)|当店からのお知らせ|ようこそ.{0,40}へ)/i
const explicitStoreAttributionPattern =
  /(?:^|投稿者[:：]\s*)(?:retreat\s*bar|campo\s*bar|b-?dash|voluptuous|agreeable|arabesque|bar\s*440|bar\s*canelo|bar\s*face|bar\s*rusk|bar\s*spear|colors\s*bar|honey\s*trap)/i
const genericStoreAuthorPattern = /^(staff|スタッフ|管理人|管理者|運営|公式|店長|オーナー|マスター|受付|事務局)$/i
const malformedPostBodyPattern =
  /(パスワードを入力|ニックネーム\s*\*|選択してください|利用規約に同意|投稿を編集|投稿を削除|bbs-edit-form|javascript:|Copyright ©)/i
const targetDateMarkerPattern = /^\[\[NR_TARGET_DATE:(\d{4}-\d{2}-\d{2})\]\]\s*/
const storeAuthorAliases: Record<string, RegExp> = {
  agreeable: /^agreeable$/i,
  arabesque: /^arabesque$/i,
  'b-dash': /^b-?dash$/i,
  bar440: /^(?:bar)?440$/i,
  'bar-canelo': /^(?:bar)?canelo$/i,
  'bar-face': /^(?:bar)?face$/i,
  'bar-rusk': /^(?:bar)?rusk$/i,
  'bar-spear': /^(?:bar)?spear$/i,
  'campo-bar': /^(?:campo(?:bar)?|barcampo)$/i,
  'club-scarlet-tokyo': /^(?:club)?scarlet(?:tokyo)?$/i,
  collabo: /^(?:akiba)?collabo$/i,
  'colors-bar': /^(?:colors(?:bar)?|barcolors)$/i,
  'communicationbar-sango': /^(?:communicationbar)?珊瑚$/i,
  'filt-shibuya': /^filt(?:shibuya)?$/i,
  'honey-trap': /^(?:bar)?honeytrap$/i,
  neo: /^neo$/i,
  'retreat-bar': /^(?:retreat(?:bar)?|barretreat)$/i,
  voluptuous: /^voluptuous$/i,
}

function normalizedAuthorForStaffCheck(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s*(?:さん|様)\s*$/u, '')
    .replace(/[^\p{Letter}\p{Number}-]/gu, '')
    .toLowerCase()
}

export function normalizedBbsPostIdentityMaterial(
  post: Pick<BbsNormalizedPost, 'articleNo' | 'authorName' | 'postedAt' | 'body'>,
) {
  const articleNo = post.articleNo?.trim()
  if (articleNo) return `article:${articleNo}`

  const author = post.authorName.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ja-JP') || '記載なし'
  const postedMinute = post.postedAt?.slice(0, 16) ?? 'time-unknown'
  const body = post.body
    .replace(targetDateMarkerPattern, '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase()
  return `body:${author}:${postedMinute}:${body}`
}

export function isLikelyCustomerNormalizedPost(
  post: Pick<BbsNormalizedPost, 'storeId' | 'authorName' | 'body'>,
) {
  const author = normalizedAuthorForStaffCheck(post.authorName)
  const matchesStoreAuthor = Boolean(author && storeAuthorAliases[post.storeId]?.test(author))
  if (author && genericStoreAuthorPattern.test(author)) return false
  if (matchesStoreAuthor) return false
  if (automatedStoreReplyPattern.test(post.body) && (matchesStoreAuthor || explicitStoreAttributionPattern.test(post.body))) return false
  if (matchesStoreAuthor && storeAuthoredContentPattern.test(post.body)) return false
  return true
}

export function isStructurallyValidCustomerNormalizedPost(
  post: Pick<BbsNormalizedPost, 'storeId' | 'authorName' | 'body'>,
) {
  if (!isLikelyCustomerNormalizedPost(post)) return false

  const author = normalizedAuthorForStaffCheck(post.authorName)
  const body = post.body.replace(targetDateMarkerPattern, '').replace(/\s+/g, ' ').trim()
  if (!author || author === '記載なし' || author.length > 80 || /^(?:投稿者|投稿日|記事番号|No\.)[:：]?$/i.test(author)) return false
  if (body.length < 2 || body.length > 1600 || malformedPostBodyPattern.test(body)) return false
  if ((body.match(/(?:投稿者|名前|Name)[:：]/gi) ?? []).length > 1) return false
  if ((body.match(/20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}/g) ?? []).length > 2) return false
  return true
}

export function isRankableCustomerNormalizedPost(
  post: Pick<BbsNormalizedPost, 'storeId' | 'authorName' | 'body' | 'postedAt'>,
) {
  return Boolean(post.postedAt) && isStructurallyValidCustomerNormalizedPost(post)
}

function normalizedPostFingerprint(post: BbsNormalizedPost) {
  return `${post.storeId}:${normalizedBbsPostIdentityMaterial(post)}`
}

export function normalizedBbsPostsToPostRecords(posts: BbsNormalizedPost[]): PostRecord[] {
  return posts
    .filter((post): post is BbsNormalizedPost & { postedAt: string } => isRankableCustomerNormalizedPost(post))
    .map((post) => {
      const targetDate = post.body.match(targetDateMarkerPattern)?.[1]
      const cleanBody = post.body.replace(targetDateMarkerPattern, '').trim()
      return {
      id: `normalized-${post.id}`,
      storeId: post.storeId,
      source: 'scrape',
      sourceUrl: post.sourceUrl,
      postedAt: post.postedAt,
      body: [
        post.articleNo ? `記事番号: ${post.articleNo}` : '',
        post.authorName !== '記載なし' ? `投稿者: ${post.authorName}${post.authorGender !== '記載なし' ? `（${post.authorGender}）` : ''}` : '',
        cleanBody,
      ]
        .filter(Boolean)
        .join(' '),
      keywords: targetDate ? [`target-date:${targetDate}`] : [],
    }
    })
}

export function buildEffectiveBbsPostRecords(posts: PostRecord[], normalizedPosts: BbsNormalizedPost[] = []) {
  if (!normalizedPosts.length) return posts
  const manualPosts = posts.filter((post) => post.source !== 'scrape')
  const seenNormalizedPosts = new Set<string>()
  const uniqueNormalizedPosts = normalizedPosts.filter((post) => {
    const fingerprint = normalizedPostFingerprint(post)
    if (seenNormalizedPosts.has(fingerprint)) return false
    seenNormalizedPosts.add(fingerprint)
    return true
  })
  return [...normalizedBbsPostsToPostRecords(uniqueNormalizedPosts), ...manualPosts].toSorted(
    (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
  )
}

export function buildSearchableBbsRecords(posts: PostRecord[], snapshots: BbsSnapshot[] = []): PostRecord[] {
  const snapshotPosts = snapshots
    .map((snapshot) => ({
      snapshot,
      body: extractCustomerBbsText(snapshot.extractedText),
    }))
    .filter(({ body }) => body.trim())
    .map<PostRecord>((snapshot) => ({
      id: `snapshot-${snapshot.snapshot.id}`,
      storeId: snapshot.snapshot.storeId,
      source: 'scrape',
      sourceUrl: snapshot.snapshot.url,
      postedAt: snapshot.snapshot.capturedAt,
      body: snapshot.body,
      keywords: [],
    }))

  const seen = new Set<string>()
  const customerPosts = posts
    .map((record) => ({
      ...record,
      body: record.source === 'scrape' ? extractCustomerBbsText(record.body) : record.body,
    }))
    .filter((record) => record.source !== 'scrape' || record.body.trim())

  return [...snapshotPosts, ...customerPosts].filter((record) => {
    const key = `${record.storeId}:${record.body.slice(0, 180)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function countMatches(body: string, pattern: RegExp) {
  return [...body.matchAll(pattern)].length
}

function stableOffset(seed: string, range = 5) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % (range * 2 + 1) - range
}

function eventContextBonus(event: EventInput) {
  const text = `${event.title} ${event.details ?? ''} ${event.category}`.trim()
  let score = 0

  if (event.startsAt) score += 2
  if (event.title.length >= 12) score += 2
  if ((event.details?.length ?? 0) >= 28) score += 3
  if (event.category && !/^(通常|イベント|未設定)$/.test(event.category)) score += 2
  if (eventFemalePattern.test(text)) score += 5
  if (eventBeginnerPattern.test(text)) score += 3
  if (eventDemandPattern.test(text)) score += 3
  if (eventDetailPattern.test(text)) score += 3

  return Math.min(14, score)
}

function mergeMetrics(metrics: BbsSnapshotMetrics[]) {
  return metrics.reduce<BbsSnapshotMetrics>(
    (total, metric) => ({
      femaleOnly: total.femaleOnly + metric.femaleOnly,
      firstVisit: total.firstVisit + metric.firstVisit,
      comeback: total.comeback + metric.comeback,
      groupVisit: total.groupVisit + metric.groupVisit,
      emoji: total.emoji + metric.emoji,
      totalSignals: total.totalSignals + metric.totalSignals,
      textLength: total.textLength + metric.textLength,
    }),
    {
      femaleOnly: 0,
      firstVisit: 0,
      comeback: 0,
      groupVisit: 0,
      emoji: 0,
      totalSignals: 0,
      textLength: 0,
    },
  )
}

export function buildBbsSnapshotMetrics(text: string): BbsSnapshotMetrics {
  const femaleOnly = countMatches(text, femaleOnlyPattern)
  const firstVisit = countMatches(text, firstVisitPattern)
  const comeback = countMatches(text, comebackPattern)
  const groupVisit = countMatches(text, groupVisitPattern)
  const emoji = countMatches(text, emojiPattern)

  return {
    femaleOnly,
    firstVisit,
    comeback,
    groupVisit,
    emoji,
    totalSignals: femaleOnly + firstVisit + comeback + groupVisit + emoji,
    textLength: text.length,
  }
}

export function scoreBbsSnapshot(metrics: BbsSnapshotMetrics) {
  const textUnits = Math.max(1, metrics.textLength / 1200)
  const signalDensity = metrics.totalSignals / textUnits
  const signalScore =
    scaledSignal(metrics.femaleOnly, 18, 22) +
    scaledSignal(metrics.firstVisit, 5, 18) +
    scaledSignal(metrics.comeback, 4, 14) +
    scaledSignal(metrics.groupVisit, 3, 10) +
    scaledSignal(metrics.emoji, 28, 8)

  return clamp(
    30 +
      signalScore +
      scaledSignal(signalDensity, 12, 14) +
      scaledSignal(metrics.textLength, 3600, 8),
    0,
    96,
  )
}

export function toneForScore(score: number): SignalTone {
  if (score >= 84) return 'hot'
  if (score >= 74) return 'warm'
  return 'quiet'
}

export function buildPrMetrics(store: StoreProfile, posts: PostRecord[]): PrMetrics {
  const storePosts = posts.filter((post) => post.storeId === store.id)
  const now = referenceTimeForPosts(posts)
  const postCount = storePosts.length
  const femalePrCount = storePosts.filter((post) => femalePrPattern.test(post.body)).length
  const specificityHits = storePosts.filter((post) => specificityPattern.test(post.body)).length
  const freshnessHits = storePosts.filter((post) => hoursSince(post.postedAt, now) <= 12).length
  const normalized = storePosts.map((post) => normalizeBody(post.body))
  const duplicateCount = normalized.length - new Set(normalized).size

  const specificity = postCount ? clamp((specificityHits / postCount) * 100) : 35
  const freshness = postCount ? clamp((freshnessHits / postCount) * 100) : 30
  const templateRate = postCount ? clamp((duplicateCount / postCount) * 100) : 0
  const femaleRatio = postCount ? femalePrCount / postCount : 0
  const trend = clamp(freshness * 0.55 + femaleRatio * 45)
  const trust = clamp(store.trustSeed + specificity * 0.12 - templateRate * 0.18)

  return {
    postCount,
    femalePrCount,
    specificity,
    freshness,
    templateRate,
    trust,
    trend,
  }
}

export function scoreEvent(event: EventInput, store: StoreProfile, posts: PostRecord[]): ScoredEvent {
  const metrics = buildPrMetrics(store, posts)
  const resolvedWeekday = eventWeekday(event)
  const normalizedEvent = { ...event, weekday: resolvedWeekday }
  const weekdayBonus = store.strongDays.includes(resolvedWeekday) ? 12 : 0
  const eventBonus = store.strongEvents.includes(event.category) ? 14 : store.weakEvents.includes(event.category) ? -9 : 3
  const sessionBonus =
    (event.session === 'day' && store.hasDaytime) || (event.session === 'night' && store.hasNight) ? 8 : -10
  const postVolumeBonus = Math.min(14, metrics.postCount * 3)
  const femaleSignalBonus = Math.min(16, metrics.femalePrCount * 4)
  const contextBonus = eventContextBonus(event)
  const sparseDataOffset = metrics.postCount === 0 ? stableOffset(`${event.storeId}:${event.date}:${event.title}`, 3) : 0

  const score = clamp(
    28 +
      weekdayBonus +
      eventBonus +
      sessionBonus +
      postVolumeBonus +
      femaleSignalBonus +
      contextBonus +
      sparseDataOffset +
      metrics.specificity * 0.12 +
      metrics.freshness * 0.1 +
      metrics.trust * 0.12 -
      metrics.templateRate * 0.08,
  )

  const reasons = [
    weekdayBonus > 0 ? `${resolvedWeekday}との相性が高い` : `${resolvedWeekday}は通常傾向`,
    eventBonus > 8 ? `${event.category}の過去実績が強い` : `${event.category}は要観測`,
    contextBonus >= 9 ? '公式イベント情報が具体的' : metrics.specificity >= 70 ? '投稿の具体性が高い' : '投稿具体性は中程度',
    metrics.freshness >= 70 ? '直近投稿が動いている' : '鮮度は追加確認が必要',
  ].slice(0, 3)

  return {
    ...normalizedEvent,
    score,
    rank: 0,
    tone: toneForScore(score),
    paidOnly: score < 84,
    store,
    metrics,
    reasons,
  }
}

export function scoreEvents(events: EventInput[], stores: StoreProfile[], posts: PostRecord[]) {
  const storeMap = new Map(stores.map((store) => [store.id, store]))
  const scored = events
    .map((event) => {
      const store = storeMap.get(event.storeId) ?? stores[0]
      return scoreEvent(event, store, posts)
    })
    .toSorted((a, b) => b.score - a.score)

  return scored.map((event, index) => ({
    ...event,
    rank: index + 1,
    paidOnly: index > 1 || event.paidOnly,
  }))
}

export function summarizeSignals(scoredEvents: ScoredEvent[], options: { referenceDate?: Date } = {}) {
  const orderedEvents = prioritizeScoredEventsForToday(scoredEvents, options)
  const dayTop = orderedEvents.filter((event) => event.session === 'day')[0]
  const nightTop = orderedEvents.filter((event) => event.session === 'night')[0]

  return {
    dayTop,
    nightTop,
    hotCount: scoredEvents.filter((event) => event.tone === 'hot').length,
    paidCount: scoredEvents.filter((event) => event.paidOnly).length,
  }
}

function eventDateDistanceDays(event: EventInput, referenceDate: Date) {
  const eventDate = resolveForecastDate(event, referenceDate)
  if (!eventDate) return Number.POSITIVE_INFINITY
  return Math.round((eventDate.getTime() - startOfJapanDate(referenceDate).getTime()) / (24 * 60 * 60 * 1000))
}

function eventDatePriority(event: EventInput, referenceDate: Date) {
  const diffDays = eventDateDistanceDays(event, referenceDate)
  if (!Number.isFinite(diffDays)) return Number.POSITIVE_INFINITY
  if (diffDays === 0) return 0
  if (diffDays > 0) return 10 + diffDays
  return 100 + Math.abs(diffDays)
}

export function prioritizeScoredEventsForToday(scoredEvents: ScoredEvent[], options: { referenceDate?: Date } = {}) {
  const referenceDate = options.referenceDate ?? new Date()
  return scoredEvents.toSorted((a, b) => {
    const priorityDiff = eventDatePriority(a, referenceDate) - eventDatePriority(b, referenceDate)
    if (priorityDiff) return priorityDiff
    return b.score - a.score
  })
}

export function parseExactTerms(value: string) {
  return [
    ...new Set(
      value
        .split(/[,\n、]/)
        .map((term) => term.normalize('NFKC').trim())
        .filter(Boolean),
    ),
  ]
}

export function buildStoreBbsAnalytics(stores: StoreProfile[], posts: PostRecord[]): StoreBbsAnalytics[] {
  const totalPosts = Math.max(1, posts.length)

  return stores
    .map((store) => {
      const storePosts = posts.filter((post) => post.storeId === store.id)
      const metrics = buildPrMetrics(store, posts)
      const weekdayStats: WeekdayPostStat[] = weekdayLabels.map((weekday) => {
        const count = storePosts.filter((post) => weekdayFromDate(post.postedAt) === weekday).length
        return {
          weekday,
          count,
          ratio: storePosts.length ? clamp((count / storePosts.length) * 100) : 0,
        }
      })
      const dominantWeekday = weekdayStats.toSorted((a, b) => b.count - a.count)[0]?.weekday ?? '未設定'
      const postRatio = clamp((storePosts.length / totalPosts) * 100)
      const femalePrRatio = storePosts.length ? clamp((metrics.femalePrCount / storePosts.length) * 100) : 0
      const weekdayConcentration = weekdayStats.reduce((max, stat) => Math.max(max, stat.ratio), 0)
      const excitement = clamp(
        postRatio * 0.42 +
          metrics.freshness * 0.22 +
          metrics.specificity * 0.18 +
          femalePrRatio * 0.12 +
          weekdayConcentration * 0.06,
      )
      const verdict = excitement >= 72 ? '盛り上がり強め' : excitement >= 48 ? '検討候補' : '追加観測'

      return {
        store,
        postCount: storePosts.length,
        postRatio,
        excitement,
        femalePrRatio,
        specificity: metrics.specificity,
        dominantWeekday,
        weekdayStats,
        verdict,
      }
    })
    .toSorted((a, b) => b.excitement - a.excitement)
}

export function buildStoreRadarPoints(stores: StoreProfile[], posts: PostRecord[], snapshots: BbsSnapshot[] = []): StoreRadarPoint[] {
  const analytics = buildStoreBbsAnalytics(stores, posts)

  const basePoints = stores
    .map((store) => {
      const analytic = analytics.find((item) => item.store.id === store.id)
      const storeSnapshots = snapshots.filter((snapshot) => snapshot.storeId === store.id)
      const mergedSignals = mergeMetrics([
        ...storeSnapshots.map((snapshot) => snapshot.metrics),
        ...posts.filter((post) => post.storeId === store.id).map((post) => buildBbsSnapshotMetrics(post.body)),
      ])
      const latestSnapshot = storeSnapshots.toSorted(
        (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
      )[0]
      const snapshotScores = storeSnapshots.map((snapshot) => snapshot.radarScore)
      const latestSnapshotScore = latestSnapshot?.radarScore ?? 0
      const snapshotScore = snapshotScores.length ? latestSnapshotScore * 0.62 + average(snapshotScores) * 0.38 : 0
      const fallbackScore = analytic?.excitement ?? 0
      const mergedSignalScore = mergedSignals.totalSignals ? scoreBbsSnapshot(mergedSignals) : 0
      const rawScore = snapshotScores.length
        ? snapshotScore * 0.84 + fallbackScore * 0.1 + mergedSignalScore * 0.06
        : fallbackScore

      return {
        store,
        score: clamp(rawScore, 0, 96),
        tone: toneForScore(rawScore),
        share: 0,
        rank: 0,
        postCount: analytic?.postCount ?? 0,
        snapshotCount: storeSnapshots.length,
        lastCapturedAt: latestSnapshot?.capturedAt,
        signals: mergedSignals,
        verdict: rawScore >= 78 ? 'Hot' : rawScore >= 52 ? '検討余地' : '様子見',
      }
    })

  const activeScores = basePoints.map((point) => point.score).filter((score) => score > 0)
  const minScore = activeScores.length ? Math.min(...activeScores) : 0
  const maxScore = activeScores.length ? Math.max(...activeScores) : 0
  const scoreRange = maxScore - minScore
  const normalizedPoints = basePoints.map((point) => {
    const relativeScore = scoreRange >= 4 ? 42 + ((point.score - minScore) / scoreRange) * 54 : point.score
    const score = point.score > 0 && scoreRange >= 4 ? clamp(point.score * 0.72 + relativeScore * 0.28, 0, 96) : point.score

    return {
      ...point,
      score,
      tone: toneForScore(score),
      verdict: score >= 78 ? 'Hot' : score >= 52 ? '検討余地' : '様子見',
    }
  })
  const totalBase = Math.max(
    1,
    normalizedPoints.reduce((sum, point) => sum + point.score, 0),
  )

  return normalizedPoints
    .map((point) => ({
      ...point,
      share: clamp((point.score / totalBase) * 100),
    }))
    .toSorted((a, b) => b.score - a.score)
    .map((point, index) => ({ ...point, rank: index + 1 }))
}

export function buildWatchedWordHits(
  posts: PostRecord[],
  stores: StoreProfile[],
  bookmarks: WordBookmark[] = [],
  options: { enabledTemplateKeys?: readonly WatchedTemplateKey[]; storeId?: string | null } = {},
): WatchedWordHit[] {
  const storeMap = new Map(stores.map((store) => [store.id, store]))
  const enabledTemplates = new Set(options.enabledTemplateKeys ?? defaultWatchedTemplateKeys)
  const storeId = options.storeId && options.storeId !== 'all' ? options.storeId : null
  const rules: Array<{ label: string; term: string; severity: WatchedWordHit['severity']; match: (body: string) => string[] }> =
    watchedTemplateRules
      .filter((rule) => enabledTemplates.has(rule.key))
      .map((rule) => ({
        label: rule.label,
        term: rule.term,
        severity: rule.severity,
        match: rule.match,
      }))

  bookmarks.forEach((bookmark) => {
    if (!bookmark.pattern.trim()) return
    const escaped = bookmark.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (bookmark.matchType === 'exact') {
      const normalizedPattern = normalizeWatchedSearchText(bookmark.pattern)
      if (!normalizedPattern) return
      rules.push({
        label: bookmark.label || bookmark.pattern,
        term: bookmark.pattern,
        severity: 'medium',
        match: (body) => (normalizeWatchedSearchText(body).includes(normalizedPattern) ? [bookmark.pattern] : []),
      })
      return
    }

    try {
      const pattern = bookmark.matchType === 'regex' ? new RegExp(bookmark.pattern, 'g') : new RegExp(escaped, 'g')
      rules.push({
        label: bookmark.label || bookmark.pattern,
        term: bookmark.pattern,
        severity: 'medium',
        match: (body) => [...body.matchAll(pattern)].map((match) => match[0] || bookmark.pattern),
      })
    } catch {
      const pattern = new RegExp(escaped, 'g')
      rules.push({
        label: bookmark.label || bookmark.pattern,
        term: bookmark.pattern,
        severity: 'medium',
        match: (body) => [...body.matchAll(pattern)].map((match) => match[0] || bookmark.pattern),
      })
    }
  })

  const hits: WatchedWordHit[] = []
  posts.forEach((post) => {
    if (storeId && post.storeId !== storeId) return
    const store = storeMap.get(post.storeId)
    if (!store) return
    const watchedText = extractWatchedAuthorText(post.body)
    if (!watchedText) return
    rules.forEach((rule) => {
      const matches = rule.match(watchedText)
      const uniqueTerms = new Map<string, string>()
      matches.forEach((match) => {
        const term = match || rule.term
        const normalizedTerm = normalizeWatchedSearchText(term)
        if (!normalizedTerm || uniqueTerms.has(normalizedTerm)) return
        uniqueTerms.set(normalizedTerm, term)
      })

      const visibleTerms = [...uniqueTerms.entries()].slice(0, 3)
      visibleTerms.forEach(([normalizedTerm, term]) => {
        hits.push({
          id: `${post.id}-${rule.label}-${normalizedTerm.slice(0, 48)}`,
          label: rule.label,
          term,
          store,
          post,
          snippet: buildSnippet(watchedText, term === 'emoji' ? term : term.slice(0, 16)),
          severity: rule.severity,
        })
      })
    })
  })

  return hits.toSorted((a, b) => new Date(b.post.postedAt).getTime() - new Date(a.post.postedAt).getTime())
}

const japanDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function startOfJapanDate(date: Date) {
  const parts = Object.fromEntries(japanDateKeyFormatter.formatToParts(date).map((part) => [part.type, part.value]))
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+09:00`)
}

function resolveForecastDate(event: EventInput, referenceDate: Date) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return parseDateInJapan(event.date)

  const reference = startOfJapanDate(referenceDate)
  if (event.date === '今日') return reference
  if (event.date === '明日') return new Date(reference.getTime() + 24 * 60 * 60 * 1000)

  const weekdayIndex = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'].indexOf(eventWeekday(event))
  if (weekdayIndex < 0) return null
  const referenceWeekdayIndex = weekdayIndexForDateInJapan(reference)
  const offset = (weekdayIndex - referenceWeekdayIndex + 7) % 7
  return new Date(reference.getTime() + offset * 24 * 60 * 60 * 1000)
}

function dateWindowBoost(event: EventInput, referenceDate: Date) {
  const eventDate = resolveForecastDate(event, referenceDate)
  if (!eventDate) return 0
  const diffDays = Math.round((eventDate.getTime() - startOfJapanDate(referenceDate).getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays < 0) return -18
  if (diffDays === 0) return 14
  if (diffDays === 1) return 10
  if (diffDays <= 3) return 6
  if (diffDays <= 7) return 2
  return 0
}

export function buildVisitForecasts(
  events: EventInput[],
  stores: StoreProfile[],
  posts: PostRecord[],
  options: { referenceDate?: Date; windowDays?: number } = {},
): VisitForecast[] {
  const watchedHits = buildWatchedWordHits(posts, stores)
  const referenceDate = options.referenceDate ?? new Date()
  const scored = scoreEvents(events, stores, posts)
  const windowed =
    typeof options.windowDays === 'number'
      ? scored.filter((event) => {
          const eventDate = resolveForecastDate(event, referenceDate)
          if (!eventDate) return false
          const diffDays = Math.round((eventDate.getTime() - startOfJapanDate(referenceDate).getTime()) / (24 * 60 * 60 * 1000))
          return diffDays >= 0 && diffDays <= options.windowDays!
        })
      : scored
  const targetEvents = windowed.length ? windowed : scored

  return targetEvents
    .map((event) => {
      const watchedSignalCount = watchedHits.filter((hit) => hit.store.id === event.storeId).length
      const score = clamp(event.score + Math.min(12, watchedSignalCount * 2) + dateWindowBoost(event, referenceDate))
      return {
        id: event.id,
        store: event.store,
        event,
        score,
        rank: 0,
        dateLabel: formatEventDateLabel(event),
        timeLabel: event.startsAt,
        watchedSignalCount,
        reasons: [
          ...event.reasons,
          watchedSignalCount ? `注目ワード ${watchedSignalCount}件` : '注目ワードは少なめ',
        ].slice(0, 4),
      }
    })
    .toSorted((a, b) => {
      const datePriority = eventDatePriority(a.event, referenceDate) - eventDatePriority(b.event, referenceDate)
      if (datePriority) return datePriority
      return b.score - a.score
    })
    .map((forecast, index) => ({ ...forecast, rank: index + 1 }))
}

export function searchExactBbsTerms(
  posts: PostRecord[],
  stores: StoreProfile[],
  groups: ExactTermSearchGroup[],
): ExactTermMatch[] {
  const storeMap = new Map(stores.map((store) => [store.id, store]))
  const matches: ExactTermMatch[] = []

  groups.forEach((group) => {
    group.terms.forEach((term) => {
      posts.forEach((post) => {
        const watchedText = extractWatchedAuthorText(post.body)
        if (!watchedText || !includesExactTerm(watchedText, term)) return
        const store = storeMap.get(post.storeId)
        if (!store) return

        matches.push({
          id: `${group.group}-${term}-${post.id}`,
          group: group.group,
          groupLabel: group.label,
          term,
          store,
          post,
          snippet: buildSnippet(watchedText, term),
        })
      })
    })
  })

  return matches.toSorted((a, b) => new Date(b.post.postedAt).getTime() - new Date(a.post.postedAt).getTime())
}
