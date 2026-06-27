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

function escapeSvgText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrapSnapshotText(value: string, maxLineLength = 26, maxLines = 34) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const lines: string[] = []
  for (let index = 0; index < normalized.length && lines.length < maxLines; index += maxLineLength) {
    lines.push(normalized.slice(index, index + maxLineLength))
  }
  return lines
}

function buildTextSnapshotDataUrl(source: BbsSource, scrapeResult: ScrapeResult, extractedText: string) {
  if (!extractedText.trim()) return undefined

  const lines = wrapSnapshotText(extractedText)
  const textRows = lines
    .map((line, index) => `<text x="22" y="${118 + index * 19}" class="body">${escapeSvgText(line)}</text>`)
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">
  <rect width="390" height="844" fill="#08111f"/>
  <rect x="14" y="14" width="362" height="816" rx="18" fill="#101827" stroke="#27364b"/>
  <text x="22" y="48" class="label">BBS本文スナップショット</text>
  <text x="22" y="78" class="title">${escapeSvgText(source.storeId)}</text>
  <text x="22" y="100" class="meta">${escapeSvgText(scrapeResult.url)}</text>
  ${textRows}
  <text x="22" y="808" class="meta">${escapeSvgText(scrapeResult.fetchedAt)}</text>
  <style>
    .label{font:700 11px -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;letter-spacing:.08em;fill:#6ea8c7}
    .title{font:700 22px -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;fill:#e8f4ff}
    .meta{font:500 10px -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;fill:#8da0b7}
    .body{font:600 13px -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;fill:#cbd7e6}
  </style>
</svg>`

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
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
  try {
    const page = await browser.newPage({
      viewport: screenshotViewport,
      userAgent: process.env.SCRAPE_USER_AGENT || defaultUserAgent,
    })
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
  const fallbackSnapshotDataUrl = browserSnapshot ? undefined : buildTextSnapshotDataUrl(source, scrapeResult, extractedText)
  const metrics = buildBbsSnapshotMetrics(extractedText)

  return {
    id: `bbs-snapshot-${randomUUID()}`,
    sourceId: source.id,
    storeId: source.storeId,
    url: scrapeResult.url,
    screenshotDataUrl: browserSnapshot?.screenshotDataUrl || fallbackSnapshotDataUrl,
    extractedText,
    metrics,
    radarScore: scoreBbsSnapshot(metrics),
    capturedAt: scrapeResult.fetchedAt,
  }
}
