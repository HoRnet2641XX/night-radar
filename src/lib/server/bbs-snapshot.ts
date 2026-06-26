import { randomUUID } from 'node:crypto'
import { buildBbsSnapshotMetrics, scoreBbsSnapshot } from '../scoring'
import type { BbsSnapshot, BbsSource, ScrapeResult } from '../types'

const screenshotViewport = { width: 390, height: 844 }
const defaultUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function readPositiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getScreenshotTimeoutMs(url: string) {
  const standardTimeoutMs = readPositiveIntEnv('BROWSER_SCREENSHOT_TIMEOUT_MS', 4_500)
  try {
    const hostname = new URL(url).hostname
    if (hostname === 'neo-bbs.com' || hostname.endsWith('.neo-bbs.com')) {
      return Math.max(standardTimeoutMs, readPositiveIntEnv('BROWSER_NEO_SCREENSHOT_TIMEOUT_MS', 8_000))
    }
  } catch {
    return standardTimeoutMs
  }

  return standardTimeoutMs
}

async function captureBrowserSnapshot(url: string) {
  if (process.env.DISABLE_BROWSER_SCREENSHOTS === 'true') return null

  let closeBrowser: (() => Promise<void>) | null = null
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    closeBrowser = () => browser.close()
    const page = await browser.newPage({
      viewport: screenshotViewport,
      userAgent: process.env.SCRAPE_USER_AGENT || defaultUserAgent,
    })
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8' })
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: getScreenshotTimeoutMs(url),
    })
    await page.waitForTimeout(readPositiveIntEnv('BROWSER_SCREENSHOT_SETTLE_MS', 180))
    const text = ((await page.locator('body').textContent({ timeout: 1_000 })) ?? '').replace(/\s+/g, ' ').trim()
    const image = await page.screenshot({
      type: 'jpeg',
      quality: 42,
      fullPage: false,
    })

    return {
      screenshotDataUrl: `data:image/jpeg;base64,${image.toString('base64')}`,
      extractedText: text.slice(0, 12_000),
    }
  } catch {
    return null
  } finally {
    await closeBrowser?.().catch(() => {})
  }
}

export async function buildBbsSnapshot(source: BbsSource, scrapeResult: ScrapeResult): Promise<BbsSnapshot> {
  const browserSnapshot = scrapeResult.status === 'ok' ? await captureBrowserSnapshot(scrapeResult.url) : null
  const extractedText = browserSnapshot?.extractedText || scrapeResult.extractedText || scrapeResult.message || ''
  const metrics = buildBbsSnapshotMetrics(extractedText)

  return {
    id: `bbs-snapshot-${randomUUID()}`,
    sourceId: source.id,
    storeId: source.storeId,
    url: scrapeResult.url,
    screenshotDataUrl: browserSnapshot?.screenshotDataUrl,
    extractedText,
    metrics,
    radarScore: scoreBbsSnapshot(metrics),
    capturedAt: scrapeResult.fetchedAt,
  }
}
