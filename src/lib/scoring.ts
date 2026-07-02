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
  StoreBbsAnalytics,
  StoreRadarPoint,
  StoreProfile,
  VisitForecast,
  WatchedWordHit,
  WeekdayPostStat,
  WordBookmark,
} from './types'
import { eventWeekday, formatEventDateLabel, parseDateInJapan, weekdayFromDate, weekdayLabels } from './date'

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
  const cleanedBody = body.replace(/^削除\s*/, '').replace(/\s+/g, ' ').trim()
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
  /(禁止事項|免責事項|当掲示板|当店|料金|入場料|登録手数料|営業時間|営業開始|営業終了|イベント|キャンペーン|お知らせ|告知|無料|割引|問い合わせ|ご質問|セキュリティ|トラブル|利用規約|アクセスブロック|責任|掲載|スタッフ|店内|システム|入会金|年会費|規約|ご来店予告|本日の来店予告)/i
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
  return value.match(/(?:記事番号[:：]?\s*|No[.\s]*)(\d{3,})/i)?.[1]
}

const bbsPostMetaOnlyPattern = /(?:記事番号[:：]?\s*\d{3,}|No[.\s]*\d{3,}|投稿日時?|投稿日|書き込み日時?|20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}|\d{1,2}[月/-]\d{1,2})/i
const bbsExplicitAuthorPattern = /(投稿者[:：]\s*(?!当店|店舗|店|スタッフ|管理|運営|公式|SystemS|システム)|名前[:：]|Name[:：])/i

function parseBbsPostedAt(value: string, observedAt: string) {
  const observedDate = new Date(observedAt)
  const fallbackYear = Number.isNaN(observedDate.getTime()) ? new Date().getFullYear() : observedDate.getFullYear()
  const fullDateMatch = value.match(
    /(20\d{2})[年/-]\s*(\d{1,2})[月/-]\s*(\d{1,2})日?(?:\([^)]+\))?\s*(\d{1,2})?(?:[:：時]\s*(\d{1,2}))?/,
  )
  const shortDateMatch =
    fullDateMatch ??
    value.match(/(\d{1,2})[月/-]\s*(\d{1,2})日?(?:\([^)]+\))?\s*(\d{1,2})?(?:[:：時]\s*(\d{1,2}))?/)
  if (!shortDateMatch) return undefined

  const hasYear = shortDateMatch.length >= 6 && /^20\d{2}$/.test(shortDateMatch[1] ?? '')
  const year = hasYear ? Number(shortDateMatch[1]) : fallbackYear
  const month = Number(shortDateMatch[hasYear ? 2 : 1])
  const day = Number(shortDateMatch[hasYear ? 3 : 2])
  const hour = Number(shortDateMatch[hasYear ? 4 : 3] ?? 0)
  const minute = Number(shortDateMatch[hasYear ? 5 : 4] ?? 0)
  if (![year, month, day, hour, minute].every(Number.isFinite)) return undefined

  const date = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0))
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function cleanNormalizedBbsPostBody(block: string, entry: WatchedAuthorEntry | null, articleNo?: string) {
  const authorName = entry?.name ? entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
  const genderToken = entry?.gender && entry.gender !== '記載なし' ? entry.gender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
  let body = entry?.body?.trim() || block

  body = body
    .replace(/(?:記事番号[:：]?\s*|No[.\s]*)\d{3,}\)?/gi, ' ')
    .replace(/(?:投稿日時?|投稿日|書き込み日時?)[:：]?\s*20\d{2}[年/-]\s*\d{1,2}[月/-]\s*\d{1,2}日?(?:\([^)]+\))?\s*\d{0,2}(?:[:：時]\s*\d{0,2})?/g, ' ')
    .replace(/(?:投稿日時?|投稿日|書き込み日時?)[:：]?\s*\d{1,2}[月/-]\s*\d{1,2}日?(?:\([^)]+\))?\s*\d{0,2}(?:[:：時]\s*\d{0,2})?/g, ' ')
    .replace(/^投稿者[:：]\s*/i, ' ')
    .replace(/^名前[:：]\s*/i, ' ')
    .replace(/^Name[:：]\s*/i, ' ')
    .replace(/^Re[:：]?\s*/i, ' ')
    .replace(/^返信[:：]?\s*/i, ' ')
    .replace(/^削除\s*/, ' ')

  if (authorName) body = body.replace(new RegExp(`^${authorName}\\s*`, 'i'), ' ')
  if (authorName && genderToken) {
    body = body.replace(new RegExp(`^${authorName}\\s*[（(]\\s*${genderToken}\\s*[）)]\\s*`, 'i'), ' ')
  }
  if (genderToken) body = body.replace(new RegExp(`^[（(]\\s*${genderToken}\\s*[）)]\\s*`, 'i'), ' ')
  if (articleNo) body = body.replace(new RegExp(`^${articleNo}\\)?\\s*`, 'i'), ' ')

  return body.replace(/\s+/g, ' ').trim()
}

export function extractNormalizedBbsPostsFromText(value: string, observedAt: string): ExtractedBbsNormalizedPost[] {
  const blocks: string[] = []
  let pendingMeta = ''
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
  const seen = new Set<string>()
  const posts: ExtractedBbsNormalizedPost[] = []

  blocks.forEach((block) => {
    const articleNo = parseBbsArticleNo(block)
    const entry = extractWatchedAuthorEntries(block)[0] ?? null
    const authorName = entry?.name?.trim() || '記載なし'
    const authorGender = entry?.gender || '記載なし'
    const body = cleanNormalizedBbsPostBody(block, entry, articleNo)
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

export function normalizedBbsPostsToPostRecords(posts: BbsNormalizedPost[]): PostRecord[] {
  return posts.map((post) => ({
    id: `normalized-${post.id}`,
    storeId: post.storeId,
    source: 'scrape',
    sourceUrl: post.sourceUrl,
    postedAt: post.postedAt ?? post.observedAt,
    body: [
      post.articleNo ? `記事番号: ${post.articleNo}` : '',
      post.authorName !== '記載なし' ? `投稿者: ${post.authorName}${post.authorGender !== '記載なし' ? `（${post.authorGender}）` : ''}` : '',
      post.body,
    ]
      .filter(Boolean)
      .join(' '),
    keywords: [],
  }))
}

export function buildEffectiveBbsPostRecords(posts: PostRecord[], normalizedPosts: BbsNormalizedPost[] = []) {
  if (!normalizedPosts.length) return posts
  const manualPosts = posts.filter((post) => post.source !== 'scrape')
  return [...normalizedBbsPostsToPostRecords(normalizedPosts), ...manualPosts].toSorted(
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

export function summarizeSignals(scoredEvents: ScoredEvent[]) {
  const dayTop = scoredEvents.filter((event) => event.session === 'day').toSorted((a, b) => b.score - a.score)[0]
  const nightTop = scoredEvents.filter((event) => event.session === 'night').toSorted((a, b) => b.score - a.score)[0]

  return {
    dayTop,
    nightTop,
    hotCount: scoredEvents.filter((event) => event.tone === 'hot').length,
    paidCount: scoredEvents.filter((event) => event.paidOnly).length,
  }
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
  const offset = (weekdayIndex - reference.getDay() + 7) % 7
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
    .toSorted((a, b) => b.score - a.score)
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
