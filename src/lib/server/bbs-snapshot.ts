import { randomUUID } from 'node:crypto'
import { buildBbsSnapshotMetrics, scoreBbsSnapshot } from '../scoring'
import { storageSafeText } from '../text'
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

export type BbsSnapshotBuildOptions = {
  captureBrowserScreenshot?: boolean
}

const screenshotViewport = { width: 390, height: 844 }
const defaultUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function readPositiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getScreenshotTimeoutMs(url: string) {
  const standardTimeoutMs = readPositiveIntEnv('BROWSER_SCREENSHOT_TIMEOUT_MS', 10_000)
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
  try {
    const page = await browser.newPage({
      viewport: screenshotViewport,
      userAgent: process.env.SCRAPE_USER_AGENT || defaultUserAgent,
    })
    try {
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8' })
      await page.goto(url, {
        // Several boards keep third-party resources open indefinitely. Waiting
        // for the first response commit keeps screenshots independent from
        // those optional resources while still proving the real page loaded.
        waitUntil: 'commit',
        timeout: getScreenshotTimeoutMs(url),
      })
      await page
        .waitForLoadState('domcontentloaded', { timeout: Math.min(getScreenshotTimeoutMs(url), 4_000) })
        .catch(() => {})
      await page.waitForTimeout(readPositiveIntEnv('BROWSER_SCREENSHOT_SETTLE_MS', 180))
      const text = await page
        .locator('body')
        .textContent({ timeout: 1_000 })
        .then((value) => (value ?? '').replace(/\s+/g, ' ').trim())
        .catch(() => '')
      const image = await page.screenshot({
        type: 'jpeg',
        quality: 42,
        fullPage: false,
      })

      return {
        screenshotDataUrl: `data:image/jpeg;base64,${image.toString('base64')}`,
        extractedText: storageSafeText(text, 12_000),
      }
    } finally {
      await page.close().catch(() => {})
    }
  } catch (error) {
    console.warn(
      '[Night Radar] browser screenshot failed:',
      url,
      error instanceof Error ? error.message : String(error),
    )
    return null
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
  if (process.env.DISABLE_BROWSER_SCREENSHOTS === 'true') {
    return {
      capture: async () => null,
      close: async () => {},
    }
  }

  let browser: BrowserLike | null = null
  let browserPromise: Promise<BrowserLike> | null = null

  async function closeBrowser() {
    await browser?.close().catch(() => {})
    browser = null
    browserPromise = null
  }

  async function getBrowser() {
    if (browser) return browser
    browserPromise ??= launchChromiumBrowser()
    browser = await browserPromise
    return browser
  }

  return {
    capture: async (url) => {
      try {
        return await captureBrowserSnapshotWithBrowser(url, await getBrowser())
      } catch {
        return null
      }
    },
    close: closeBrowser,
  }
}

export async function buildBbsSnapshot(
  source: BbsSource,
  scrapeResult: ScrapeResult,
  browserSession?: BrowserSnapshotSession | null,
  options: BbsSnapshotBuildOptions = {},
): Promise<BbsSnapshot> {
  const browserSnapshot =
    scrapeResult.status === 'ok' && options.captureBrowserScreenshot !== false
      ? await (browserSession ? browserSession.capture(scrapeResult.url) : captureBrowserSnapshot(scrapeResult.url))
      : null
  // Browser text is only a fallback. A visual capture must never replace the
  // canonical text parser used for rankings and normalized customer posts.
  const extractedText = scrapeResult.extractedText || browserSnapshot?.extractedText || scrapeResult.message || ''
  const metrics = buildBbsSnapshotMetrics(extractedText)

  return {
    id: `bbs-snapshot-${randomUUID()}`,
    sourceId: source.id,
    storeId: source.storeId,
    url: scrapeResult.url,
    // Text-only crawls still create metric snapshots, but only a real browser
    // capture is stored in the screenshot field.
    screenshotDataUrl: browserSnapshot?.screenshotDataUrl,
    extractedText,
    metrics,
    radarScore: scoreBbsSnapshot(metrics),
    capturedAt: scrapeResult.fetchedAt,
  }
}
