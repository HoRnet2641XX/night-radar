import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'

function loadDotEnv(file) {
  return readFile(file, 'utf8')
    .then((text) => {
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const index = trimmed.indexOf('=')
        if (index < 0) continue
        const key = trimmed.slice(0, index).trim()
        const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
        if (key && process.env[key] == null) process.env[key] = value
      }
    })
    .catch(() => {})
}

const eventSchema = z.object({
  events: z.array(
    z.object({
      date: z.string().regex(/^2026-(06|07)-\d{2}$/),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')),
      session: z.enum(['day', 'night']),
      title: z.string().min(1).max(120),
      category: z.string().min(1).max(60),
      details: z.string().max(260),
      confidence: z.number().min(0).max(1),
    }),
  ),
  notes: z.array(z.string()).max(8),
})

function compactText(text) {
  return text
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 18_000)
}

function mediaTypeFor(filePath) {
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg'
  return 'image/png'
}

async function dataUrl(filePath) {
  const data = await readFile(filePath)
  return `data:${mediaTypeFor(filePath)};base64,${data.toString('base64')}`
}

function shouldUseScreenshot(result, text) {
  if (result.status !== 200) return false
  if (text.length < 900) return true
  return /月間スケジュール|イベントカレンダー\s*$/i.test(text) && !/\d{1,2}[\/月]\d{0,2}/.test(text)
}

function monthLabel(month) {
  return month === '2026-07' ? '2026年7月' : '2026年6月'
}

async function extractPage(openai, result) {
  if (!result.ok || result.status !== 200 || !result.textPath) {
    return {
      source: result,
      events: [],
      notes: [`取得失敗またはHTTP ${result.status ?? 'unknown'} のため抽出対象外`],
    }
  }

  const rawText = await readFile(result.textPath, 'utf8')
  const text = compactText(rawText)
  const useScreenshot = shouldUseScreenshot(result, text)

  const prompt = [
    `店舗: ${result.storeName}`,
    `対象月: ${monthLabel(result.month)}`,
    `URL: ${result.url}`,
    '',
    '公開イベントページから、対象月に明示されている店舗イベントだけを抽出してください。',
    '重要ルール:',
    '- 画面・本文に明示されていないイベントは作らない。',
    '- BBS注意書き、料金表、ナビゲーション、通常営業時間、投稿フォーム文言はイベントにしない。',
    '- 色付きカレンダーで凡例がある場合は、色付きの日付を凡例名のイベントとして抽出する。',
    '- 「毎月第3金曜日」「毎月第4木曜日」などの明示的な定期イベントは、対象月の日付に換算してよい。',
    '- 時刻が不明な場合は startTime を空文字にする。',
    '- 昼の部、10:00、13:00、昼営業は session=day。夜の部、18:00以降、22:00、翌5:00は session=night。',
    '- タイトルと詳細は日本語で短く。成人向けの過度に露骨な描写は要約して、イベント識別に必要な範囲に抑える。',
    '- confidence が 0.65 未満になりそうな曖昧な候補は events に入れず notes に理由を書く。',
    '',
    '抽出元テキスト:',
    text || '(本文テキストなし。スクリーンショットを参照)',
  ].join('\n')

  const content = [{ type: 'input_text', text: prompt }]
  if (useScreenshot && result.screenshotPath) {
    content.push({ type: 'input_image', image_url: await dataUrl(result.screenshotPath), detail: 'high' })
  }

  const response = await openai.responses.parse({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    input: [
      {
        role: 'system',
        content:
          'You extract event-calendar data from public Japanese venue pages. Be conservative. Return only explicit structured facts. Do not invent missing events.',
      },
      { role: 'user', content },
    ],
    text: {
      format: zodTextFormat(eventSchema, 'event_calendar_extraction'),
    },
  })

  const parsed = response.output_parsed ?? { events: [], notes: ['抽出結果を解析できませんでした。'] }
  return {
    source: result,
    events: parsed.events.map((event) => ({
      ...event,
      storeId: result.storeId,
      storeName: result.storeName,
      sourceUrl: result.url,
    })),
    notes: parsed.notes,
    usedScreenshot: useScreenshot,
  }
}

await loadDotEnv(path.join(process.cwd(), '.env.local'))
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required for event extraction.')
}

const resultPath = process.argv[2]
if (!resultPath) throw new Error('Usage: node scripts/extract-events-from-scrape.mjs <results.json>')

const scrapeRun = JSON.parse(await readFile(resultPath, 'utf8'))
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 1 })
const extracted = []

for (const result of scrapeRun.results) {
  console.log(`[event-extract] ${result.storeName} ${result.month}`)
  try {
    extracted.push(await extractPage(openai, result))
  } catch (error) {
    extracted.push({
      source: result,
      events: [],
      notes: [error instanceof Error ? error.message : String(error)],
    })
  }
}

const outputPath = path.join(path.dirname(resultPath), 'events.extracted.json')
await writeFile(outputPath, JSON.stringify({ scrapeRun: resultPath, extracted }, null, 2))

const events = extracted.flatMap((item) => item.events)
const summary = {
  pages: extracted.length,
  pagesWithEvents: extracted.filter((item) => item.events.length > 0).length,
  events: events.length,
  outputPath,
}
console.log(JSON.stringify(summary, null, 2))
