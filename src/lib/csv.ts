import Papa from 'papaparse'
import { z } from 'zod'
import type { EventInput, PostRecord, StoreProfile } from './types'
import { eventWeekday } from './date'

const storeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  area: z.string().default('未設定'),
  address: z.string().optional(),
  nearestStation: z.string().optional(),
  phone: z.string().optional(),
  officialUrl: z.string().optional(),
  mapUrl: z.string().optional(),
  priceNote: z.string().optional(),
  tags: z.string().default(''),
  hasDaytime: z.coerce.boolean().default(false),
  hasNight: z.coerce.boolean().default(true),
  openingHourDay: z.string().default('13:00'),
  openingHourNight: z.string().default('19:00'),
  prStructure: z.string().default('未分類'),
  strongDays: z.string().default(''),
  strongEvents: z.string().default(''),
  weakEvents: z.string().default(''),
  trustSeed: z.coerce.number().default(60),
})

const eventSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  date: z.string().default('今日'),
  weekday: z.string().default('未設定'),
  startsAt: z.string().default('19:00'),
  session: z.enum(['day', 'night']).default('night'),
  category: z.string().default('未分類'),
  title: z.string().default('イベント'),
  sourceUrl: z.string().optional(),
})

const postSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  source: z.enum(['manual', 'csv', 'scrape', 'ai']).default('csv'),
  sourceUrl: z.string().optional(),
  postedAt: z.string().default(() => new Date().toISOString()),
  body: z.string().min(1),
  keywords: z.string().default(''),
})

const headerAliases: Record<string, string> = {
  ID: 'id',
  id: 'id',
  店舗ID: 'storeId',
  store_id: 'storeId',
  店舗名: 'name',
  店名: 'name',
  エリア: 'area',
  住所: 'address',
  最寄り: 'nearestStation',
  最寄駅: 'nearestStation',
  電話: 'phone',
  電話番号: 'phone',
  phone: 'phone',
  公式URL: 'officialUrl',
  公式サイト: 'officialUrl',
  地図URL: 'mapUrl',
  料金: 'priceNote',
  料金メモ: 'priceNote',
  タグ: 'tags',
  昼営業: 'hasDaytime',
  夜営業: 'hasNight',
  昼開始: 'openingHourDay',
  夜開始: 'openingHourNight',
  PR構造: 'prStructure',
  強い曜日: 'strongDays',
  強いイベント: 'strongEvents',
  弱いイベント: 'weakEvents',
  信頼度: 'trustSeed',
  日付: 'date',
  曜日: 'weekday',
  開始: 'startsAt',
  開始時刻: 'startsAt',
  時間帯: 'session',
  カテゴリ: 'category',
  イベント名: 'title',
  タイトル: 'title',
  URL: 'sourceUrl',
  ソースURL: 'sourceUrl',
  source_url: 'sourceUrl',
  投稿日時: 'postedAt',
  本文: 'body',
  投稿本文: 'body',
  キーワード: 'keywords',
}

function splitList(value: string) {
  return value
    .split(/[,\n、]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function stableCsvId(kind: 'stores' | 'events' | 'posts', row: Record<string, string>, index: number) {
  const raw = Object.entries(row)
    .filter(([key]) => key !== 'id')
    .map(([key, value]) => `${key}:${value}`)
    .join('|')
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0
  }
  return `${kind}-${index + 1}-${hash.toString(36)}`
}

function normalizeRow(row: Record<string, string>, kind: 'stores' | 'events' | 'posts', index: number) {
  const normalized: Record<string, string> = {}
  Object.entries(row).forEach(([key, value]) => {
    const trimmedKey = key.trim()
    normalized[headerAliases[trimmedKey] ?? trimmedKey] = String(value ?? '').trim()
  })
  if (!normalized.id) normalized.id = stableCsvId(kind, normalized, index)
  if (kind === 'stores' && !normalized.storeId) normalized.storeId = normalized.id
  return normalized
}

export function parseCsvText(text: string, kind: 'stores' | 'events' | 'posts') {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  })

  if (parsed.errors.length) {
    return {
      items: [],
      errors: parsed.errors.map((error) => `${error.row ?? '-'}: ${error.message}`),
    }
  }

  const errors: string[] = []
  const items: Array<StoreProfile | EventInput | PostRecord> = []

  parsed.data.forEach((row, index) => {
    const normalizedRow = normalizeRow(row, kind, index)
    const result =
      kind === 'stores'
        ? storeSchema.safeParse(normalizedRow)
        : kind === 'events'
          ? eventSchema.safeParse(normalizedRow)
          : postSchema.safeParse(normalizedRow)

    if (!result.success) {
      errors.push(`${index + 2}: ${result.error.issues.map((issue) => issue.message).join(', ')}`)
      return
    }

    if (kind === 'stores') {
      const store = result.data as z.infer<typeof storeSchema>
      items.push({
        ...store,
        tags: splitList(store.tags),
        strongDays: splitList(store.strongDays),
        strongEvents: splitList(store.strongEvents),
        weakEvents: splitList(store.weakEvents),
      })
      return
    }

    if (kind === 'posts') {
      const post = result.data as z.infer<typeof postSchema>
      items.push({
        ...post,
        keywords: splitList(post.keywords),
      })
      return
    }

    const event = result.data as EventInput
    items.push({ ...event, weekday: eventWeekday(event) })
  })

  return { items, errors }
}

export const csvTemplates = {
  stores:
    'id,name,area,address,nearestStation,phone,officialUrl,mapUrl,priceNote,tags,hasDaytime,hasNight,openingHourDay,openingHourNight,prStructure,strongDays,strongEvents,weakEvents,trustSeed\nsample-store,サンプル店,都内,東京都内,最寄駅,03-0000-0000,https://example.com,https://maps.google.com,公式で確認,"昼営業,初心者",true,true,13:00,19:00,具体型,"火曜,金曜","昼主婦系,初心者系",SM系,72\n',
  events:
    'id,storeId,date,weekday,startsAt,session,category,title,sourceUrl\nev-sample,sample-store,今日,火曜,13:00,day,昼主婦系,昼イベント,https://example.com\n',
  posts:
    'id,storeId,source,sourceUrl,postedAt,body,keywords\npost-sample,sample-store,csv,https://example.com,2026-05-31T12:00:00.000Z,本日13時から昼イベント。主婦ワードあり。,"昼,主婦"\n',
}
