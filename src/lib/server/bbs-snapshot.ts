import { randomUUID } from 'node:crypto'
import { buildBbsSnapshotMetrics, scoreBbsSnapshot } from '../scoring'
import type { BbsSnapshot, BbsSource, ScrapeResult } from '../types'

type BrowserSnapshot = {
  screenshotDataUrl: string
  extractedText: string
}

type BrowserLike = Awaited<ReturnType<typeof launchChromiumBrowser>>

export type BrowserSnapshotSession = {
  capture: (url: string) => Promise<BrowserSnapshot | null>
  close: () => Promise<void>
}

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
      return Math.max(standardTimeoutMs, readPositiveIntEnv('BROWSER_NEO_SCREENSHOT_TIMEOUT_MS', 12_000))
    }
  } catch {
    return standardTimeoutMs
  }

  return standardTimeoutMs
}

async function launchChromiumBrowser() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const [{ default: chromium }, { chromium: playwrightChromium }] = await Promise.all([
      import('@sparticuz/chromium'),
      import('playwright-core'),
    ])

    return playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  const { chromium } = await import('playwright')
  return chromium.launch({ headless: true })
}

async function captureBrowserSnapshotWithBrowser(url: string, browser: BrowserLike): Promise<BrowserSnapshot | null> {
  let closeContext: (() => Promise<void>) | null = null
  try {
    const context = await browser.newContext({
      viewport: screenshotViewport,
      userAgent: process.env.SCRAPE_USER_AGENT || defaultUserAgent,
    })
    closeContext = () => context.close()
    const page = await context.newPage()
    try {
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
    } finally {
      await page.close().catch(() => {})
    }
  } catch {
    return null
  } finally {
    await closeContext?.().catch(() => {})
  }
}

async function captureBrowserSnapshot(url: string): Promise<BrowserSnapshot | null> {
  if (process.env.DISABLE_BROWSER_SCREENSHOTS === 'true') return null

  let closeBrowser: (() => Promise<void>) | null = null
  try {
    const browser = await launchChromiumBrowser()
    closeBrowser = () => browser.close()
    return await captureBrowserSnapshotWithBrowser(url, browser)
  } catch {
    return null
  } finally {
    await closeBrowser?.().catch(() => {})
  }
}

export async function createBrowserSnapshotSession(): Promise<BrowserSnapshotSession> {
  return {
    capture: (url) => captureBrowserSnapshot(url),
    close: async () => {},
  }
}

export async function buildBbsSnapshot(
  source: BbsSource,
  scrapeResult: ScrapeResult,
  browserSession?: BrowserSnapshotSession | null,
): Promise<BbsSnapshot> {
  const browserSnapshot =
    scrapeResult.status === 'ok' ? await (browserSession ? browserSession.capture(scrapeResult.url) : captureBrowserSnapshot(scrapeResult.url)) : null
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
