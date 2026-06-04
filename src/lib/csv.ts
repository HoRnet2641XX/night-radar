import Papa from 'papaparse'
import { z } from 'zod'
import type { EventInput, PostRecord, StoreProfile } from './types'

const storeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  area: z.string().default('未設定'),
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

function splitList(value: string) {
  return value
    .split(/[,\n、]/)
    .map((item) => item.trim())
    .filter(Boolean)
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
    const result =
      kind === 'stores' ? storeSchema.safeParse(row) : kind === 'events' ? eventSchema.safeParse(row) : postSchema.safeParse(row)

    if (!result.success) {
      errors.push(`${index + 2}: ${result.error.issues.map((issue) => issue.message).join(', ')}`)
      return
    }

    if (kind === 'stores') {
      const store = result.data as z.infer<typeof storeSchema>
      items.push({
        ...store,
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

    items.push(result.data as EventInput)
  })

  return { items, errors }
}

export const csvTemplates = {
  stores:
    'id,name,area,hasDaytime,hasNight,openingHourDay,openingHourNight,prStructure,strongDays,strongEvents,weakEvents,trustSeed\nsample-store,サンプル店,都内,true,true,13:00,19:00,具体型,"火曜,金曜","昼主婦系,初心者系",SM系,72\n',
  events:
    'id,storeId,date,weekday,startsAt,session,category,title,sourceUrl\nev-sample,sample-store,今日,火曜,13:00,day,昼主婦系,昼イベント,https://example.com\n',
  posts:
    'id,storeId,source,sourceUrl,postedAt,body,keywords\npost-sample,sample-store,csv,https://example.com,2026-05-31T12:00:00.000Z,本日13時から昼イベント。主婦ワードあり。,"昼,主婦"\n',
}
