import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

function tokyoMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const value = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}`
}

const targetMonth = process.argv[2] && /^\d{4}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : tokyoMonth()
const [year, month] = targetMonth.split('-')
const compactMonth = `${year}${month}`
const monthStart = `${targetMonth}-01`

const sources = [
  { storeId: 'agreeable', storeName: 'AgreeAble', urls: [`https://agreeable.bar/calendar/?month=${month}&year_data=${year}`] },
  { storeId: 'arabesque', storeName: 'ARABESQUE', urls: ['https://arabesque.jpn.com/event/'] },
  { storeId: 'b-dash', storeName: 'B-DASH', urls: [`https://b-dash.bar/calendar/?month=${month}&year_data=${year}`] },
  { storeId: 'bar-canelo', storeName: 'BAR CANELO', urls: [`https://barcanelo.com/event/${compactMonth}/`] },
  { storeId: 'bar-face', storeName: 'BAR FACE', urls: [`https://bar-face.jp/event/${compactMonth}/`] },
  { storeId: 'bar-rusk', storeName: 'BAR RUSK', urls: [`https://bar-rusk.com/event/${compactMonth}/`] },
  { storeId: 'bar-spear', storeName: 'BAR SPEAR', urls: [`https://www.barspear.com/event/${compactMonth}/`] },
  {
    storeId: 'bar440',
    storeName: 'BAR440',
    urls: ['https://bar440.jimdofree.com/%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88%E3%82%AB%E3%83%AC%E3%83%B3%E3%83%80%E3%83%BC/'],
  },
  { storeId: 'campo-bar', storeName: 'CAMPO BAR', urls: [`https://campo-bar.com/event/${compactMonth}/`] },
  { storeId: 'club-scarlet-tokyo', storeName: 'CLUB SCARLET TOKYO', urls: ['https://scarlet.tokyo/'] },
  { storeId: 'club-zeus', storeName: 'CLUB ZEUS', urls: ['http://sm-zeus.com/calendar/', 'http://sm-zeus.com/event/'] },
  { storeId: 'collabo', storeName: 'collabo', urls: ['https://www.collabo7.com/p/11/'] },
  { storeId: 'colors-bar', storeName: 'COLORS BAR', urls: [`https://t-colors.net/event/list?date=${monthStart}`] },
  { storeId: 'communicationbar-sango', storeName: 'Communicationbar 珊瑚', urls: ['https://bar-sango.com/events/'] },
  { storeId: 'filt-shibuya', storeName: 'FILT SHIBUYA', urls: ['https://filtshibuya.com/event/'] },
  { storeId: 'harnes-tokyo', storeName: 'HARNES TOKYO', urls: ['https://harnes.tokyo/event-calendar/'] },
  { storeId: 'honey-trap', storeName: 'HONEY TRAP', urls: [`https://www.bar-honeytrap.com/event/${compactMonth}/`] },
  { storeId: 'land-land', storeName: 'land land', urls: ['https://land2021.com/category/event/'] },
  {
    storeId: 'mille-feuille',
    storeName: 'Mille-feuille',
    urls: ['https://www.millefeuillesby.com/%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88%E3%82%B9%E3%82%B1%E3%82%B8%E3%83%A5%E3%83%BC%E3%83%AB%E3%82%AB%E3%83%AC%E3%83%B3%E3%83%80%E3%83%BC'],
  },
  { storeId: 'neo', storeName: 'Neo', urls: ['https://neo-nk.com/'] },
  { storeId: 'ogikubo-himitsu-club', storeName: '荻窪秘密倶楽部', urls: [`https://ogikubo0620.com/events/%e6%9c%88/${targetMonth}/`] },
  { storeId: 'papillon', storeName: 'Papillon', urls: [`https://bar-papillon.net/event?date=${monthStart}`] },
  { storeId: 'retreat-bar', storeName: 'RETREAT BAR', urls: [`https://retreatbar.jp/event/${compactMonth}/`] },
  {
    storeId: 'secret-bar-silent-moon',
    storeName: 'Secret Bar Silent Moon',
    urls: [
      'https://www.silent-moon.net/jp/event.php',
      'https://www.silent-moon.net/bbs2025/yybbs.cgi?pg=0',
      'https://www.silent-moon.net/bbs2025/yybbs.cgi?pg=10',
    ],
  },
  { storeId: 'voluptuous', storeName: 'Voluptuous', urls: ['https://voluptuous.tokyo/event'] },
].map((source) => ({ ...source, month: targetMonth }))

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
      const eventArticles = Array.from(document.querySelectorAll('.art'))
        .map((article) => {
          const directChildren = Array.from(article.children)
          const bodyElement = directChildren.find((element) => element.tagName === 'P')
          const infoElement = directChildren.find((element) => element.classList.contains('art-info'))
          return {
            title: article.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            body: bodyElement?.textContent?.replace(/[\t ]+/g, ' ').trim() ?? '',
            author: infoElement?.querySelector('b')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            postedAt: infoElement?.querySelector('.num')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          }
        })
        .filter((article) => article.title && article.postedAt)

      return {
        title: document.title,
        visibleText,
        links,
        eventArticles,
      }
    })

    const embeddedTexts = []
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue
      const frameUrl = frame.url()
      if (!/calendar\.google\.com|crayoncal\.e-shops\.jp/i.test(frameUrl)) continue
      const frameText = await frame.locator('body').innerText().catch(() => '')
      if (frameText.trim()) embeddedTexts.push({ url: frameUrl, text: frameText })
    }
    const combinedText = [payload.visibleText, ...embeddedTexts.map((frame) => frame.text)]
      .filter(Boolean)
      .join('\n\n')

    const textPath = path.join(outputDir, `${fileBase}.txt`)
    await writeFile(textPath, combinedText)

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
      textLength: combinedText.length,
      links: payload.links,
      eventArticles: payload.eventArticles,
      embeddedFrames: embeddedTexts.map((frame) => ({ url: frame.url, textLength: frame.text.length })),
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

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
})
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
