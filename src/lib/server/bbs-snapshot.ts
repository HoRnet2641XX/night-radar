import { randomUUID } from 'node:crypto'
import { buildBbsSnapshotMetrics, scoreBbsSnapshot } from '../scoring'
import type { BbsSnapshot, BbsSource, ScrapeResult } from '../types'

const screenshotViewport = { width: 390, height: 844 }

async function captureBrowserSnapshot(url: string) {
  if (process.env.DISABLE_BROWSER_SCREENSHOTS === 'true') return null

  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: screenshotViewport })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12_000 })
    await page.waitForTimeout(600)
    const text = ((await page.locator('body').textContent({ timeout: 2_000 })) ?? '').replace(/\s+/g, ' ').trim()
    const image = await page.screenshot({
      type: 'jpeg',
      quality: 42,
      fullPage: false,
    })
    await browser.close()

    return {
      screenshotDataUrl: `data:image/jpeg;base64,${image.toString('base64')}`,
      extractedText: text.slice(0, 12_000),
    }
  } catch {
    return null
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
