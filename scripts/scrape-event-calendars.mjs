import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const sources = [
  { storeId: 'collabo', storeName: 'collabo', month: '2026-06', urls: ['https://www.collabo7.com/p/11/'] },
  { storeId: 'honey-trap', storeName: 'HONEY TRAP', month: '2026-06', urls: ['https://www.bar-honeytrap.com/event/202606/'] },
  { storeId: 'honey-trap', storeName: 'HONEY TRAP', month: '2026-07', urls: ['https://www.bar-honeytrap.com/event/202607/'] },
  { storeId: 'bar-rusk', storeName: 'BAR RUSK', month: '2026-06', urls: ['https://bar-rusk.com/event/202606/'] },
  { storeId: 'papillon', storeName: 'Papillon', month: '2026-06', urls: ['https://bar-papillon.net/event?date=2026-06-01'] },
  { storeId: 'papillon', storeName: 'Papillon', month: '2026-07', urls: ['https://bar-papillon.net/event?date=2026-07-01'] },
  { storeId: 'harnes-tokyo', storeName: 'HARNES TOKYO', month: '2026-06', urls: ['https://harnes.tokyo/event-calendar/'] },
  { storeId: 'harnes-tokyo', storeName: 'HARNES TOKYO', month: '2026-07', urls: ['https://harnes.tokyo/event-calendar/'] },
  { storeId: 'bar-face', storeName: 'BAR FACE', month: '2026-06', urls: ['https://bar-face.jp/event/202606/'] },
  { storeId: 'campo-bar', storeName: 'CAMPO BAR', month: '2026-06', urls: ['https://campo-bar.com/event/202606/'] },
  { storeId: 'campo-bar', storeName: 'CAMPO BAR', month: '2026-07', urls: ['https://campo-bar.com/event/202607/'] },
  { storeId: 'arabesque', storeName: 'ARABESQUE', month: '2026-06', urls: ['https://arabesque.jpn.com/event/'] },
  { storeId: 'colors-bar', storeName: 'COLORS BAR', month: '2026-06', urls: ['https://t-colors.net/event/list?date=2026-06-01'] },
  { storeId: 'colors-bar', storeName: 'COLORS BAR', month: '2026-07', urls: ['https://t-colors.net/event/list?date=2026-07-01'] },
  {
    storeId: 'bar440',
    storeName: 'BAR440',
    month: '2026-06',
    urls: ['https://bar440.jimdofree.com/%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88%E3%82%AB%E3%83%AC%E3%83%B3%E3%83%80%E3%83%BC/'],
  },
  { storeId: 'voluptuous', storeName: 'Voluptuous', month: '2026-06', urls: ['https://voluptuous.tokyo/event'] },
  { storeId: 'voluptuous', storeName: 'Voluptuous', month: '2026-07', urls: ['https://voluptuous.tokyo/event'] },
  { storeId: 'retreat-bar', storeName: 'RETREAT BAR', month: '2026-06', urls: ['https://retreatbar.jp/event/202606/'] },
  { storeId: 'retreat-bar', storeName: 'RETREAT BAR', month: '2026-07', urls: ['https://retreatbar.jp/event/202607/'] },
  { storeId: 'agreeable', storeName: 'AgreeAble', month: '2026-06', urls: ['https://agreeable.bar/calendar/?month=06&year_data=2026'] },
  { storeId: 'agreeable', storeName: 'AgreeAble', month: '2026-07', urls: ['https://agreeable.bar/calendar/?month=07&year_data=2026'] },
  { storeId: 'secret-bar-silent-moon', storeName: 'Secret Bar Silent Moon', month: '2026-06', urls: ['https://www.silent-moon.net/jp/event.php'] },
  { storeId: 'bar-spear', storeName: 'BAR SPEAR', month: '2026-06', urls: ['https://www.barspear.com/event/202606/'] },
  { storeId: 'bar-canelo', storeName: 'BAR CANELO', month: '2026-06', urls: ['https://barcanelo.com/event/202606/'] },
  { storeId: 'b-dash', storeName: 'B-DASH', month: '2026-06', urls: ['https://b-dash.bar/calendar/?month=06&year_data=2026'] },
  { storeId: 'b-dash', storeName: 'B-DASH', month: '2026-07', urls: ['https://b-dash.bar/calendar/?month=07&year_data=2026'] },
  { storeId: 'ogikubo-himitsu-club', storeName: '荻窪秘密倶楽部', month: '2026-06', urls: ['https://ogikubo0620.com/events/%e6%9c%88/'] },
  { storeId: 'ogikubo-himitsu-club', storeName: '荻窪秘密倶楽部', month: '2026-07', urls: ['https://ogikubo0620.com/events/%e6%9c%88/2026-07/'] },
  { storeId: 'club-zeus', storeName: 'CLUB ZEUS', month: '2026-06', urls: ['http://sm-zeus.com/calendar/', 'http://sm-zeus.com/event/'] },
  { storeId: 'land-land', storeName: 'land land', month: '2026-06', urls: ['https://land2021.com/category/event/'] },
  { storeId: 'land-land', storeName: 'land land', month: '2026-07', urls: ['https://land2021.com/category/event/'] },
  { storeId: 'filt-shibuya', storeName: 'FILT SHIBUYA', month: '2026-06', urls: ['https://filtshibuya.com/event/'] },
  { storeId: 'communicationbar-sango', storeName: 'Communicationbar 珊瑚', month: '2026-06', urls: ['https://bar-sango.com/events/'] },
  { storeId: 'off-white', storeName: 'Off White', month: '2026-06', urls: ['https://off-white.bar/'] },
]

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ン一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
}

async function acceptInterstitials(page) {
  const labels = [
    'Enter',
    'ENTER',
    '入場',
    'はい',
    '同意',
    '承認',
    'OK',
    'Close',
    '閉じる',
    '18歳',
    '18才',
  ]

  for (const label of labels) {
    const locator = page.getByText(label, { exact: false }).first()
    try {
      if (await locator.isVisible({ timeout: 500 })) {
        await locator.click({ timeout: 1_000 })
        await page.waitForTimeout(700)
      }
    } catch {
      // Ignore non-clickable text matches.
    }
  }
}

async function scrapeOne(page, source, url, index, outputDir) {
  const fileBase = `${source.month}-${source.storeId}-${index}-${slug(new URL(url).hostname)}`
  const startedAt = new Date().toISOString()

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(1_500)
    await acceptInterstitials(page)
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})

    const screenshotPath = path.join(outputDir, `${fileBase}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const payload = await page.evaluate(() => {
      const visibleText = document.body?.innerText ?? ''
      const links = Array.from(document.querySelectorAll('a'))
        .map((link) => ({
          text: (link.textContent ?? '').replace(/\s+/g, ' ').trim(),
          href: link.href,
        }))
        .filter((link) => link.text || link.href)
        .slice(0, 300)

      return {
        title: document.title,
        visibleText,
        links,
      }
    })

    const textPath = path.join(outputDir, `${fileBase}.txt`)
    await writeFile(textPath, payload.visibleText)

    return {
      ok: true,
      storeId: source.storeId,
      storeName: source.storeName,
      month: source.month,
      url,
      status: response?.status() ?? null,
      title: payload.title,
      textPath,
      screenshotPath,
      textLength: payload.visibleText.length,
      links: payload.links,
      scrapedAt: startedAt,
    }
  } catch (error) {
    return {
      ok: false,
      storeId: source.storeId,
      storeName: source.storeName,
      month: source.month,
      url,
      error: error instanceof Error ? error.message : String(error),
      scrapedAt: startedAt,
    }
  }
}

const runId = new Date().toISOString().replace(/[:.]/g, '-')
const outputDir = path.join(process.cwd(), 'output', 'event-scrape', runId)
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  viewport: { width: 1440, height: 1200 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 NightRadarCalendarBot/1.0',
})

const results = []
for (const source of sources) {
  for (const [index, url] of source.urls.entries()) {
    const page = await context.newPage()
    console.log(`[event-scrape] ${source.storeName} ${source.month} ${url}`)
    const result = await scrapeOne(page, source, url, index, outputDir)
    results.push(result)
    await page.close().catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

await browser.close()

const resultPath = path.join(outputDir, 'results.json')
await writeFile(resultPath, JSON.stringify({ runId, outputDir, results }, null, 2))

const summary = results.reduce(
  (acc, result) => {
    acc.total += 1
    if (result.ok) acc.ok += 1
    else acc.failed += 1
    return acc
  },
  { total: 0, ok: 0, failed: 0 },
)

console.log(JSON.stringify({ ...summary, resultPath }, null, 2))
