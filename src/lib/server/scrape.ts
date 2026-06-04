import * as cheerio from 'cheerio'
import type { PostRecord, ScrapeResult } from '../types'

const blockedHostPatterns = [/^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[0-1])\./, /\.local$/i]

function isAllowedHost(hostname: string) {
  if (blockedHostPatterns.some((pattern) => pattern.test(hostname))) return false

  const allowed = process.env.SCRAPE_ALLOWED_HOSTS?.split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  if (!allowed?.length) return true
  return allowed.includes(hostname)
}

export async function scrapePublicPage(urlValue: string): Promise<ScrapeResult> {
  let url: URL
  try {
    url = new URL(urlValue)
  } catch {
    return {
      url: urlValue,
      title: '',
      extractedText: '',
      fetchedAt: new Date().toISOString(),
      status: 'failed',
      message: 'URL format is invalid.',
    }
  }

  if (!['http:', 'https:'].includes(url.protocol) || !isAllowedHost(url.hostname)) {
    return {
      url: url.toString(),
      title: '',
      extractedText: '',
      fetchedAt: new Date().toISOString(),
      status: 'blocked',
      message: 'This host is blocked by the scraper safety policy.',
    }
  }

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      headers: {
        'User-Agent': 'NightRadarBot/0.1 (+https://example.com; public-info aggregation)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!response.ok) {
      return {
        url: url.toString(),
        title: '',
        extractedText: '',
        fetchedAt: new Date().toISOString(),
        status: 'failed',
        message: `Fetch failed with ${response.status}.`,
      }
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      return {
        url: url.toString(),
        title: '',
        extractedText: '',
        fetchedAt: new Date().toISOString(),
        status: 'blocked',
        message: 'Only public HTML pages are supported.',
      }
    }

    const html = (await response.text()).slice(0, 500_000)
    const $ = cheerio.load(html)
    $('script, style, noscript, iframe, svg').remove()
    const title = $('title').first().text().trim()
    const extractedText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 12_000)

    return {
      url: url.toString(),
      title,
      extractedText,
      fetchedAt: new Date().toISOString(),
      status: 'ok',
    }
  } catch (error) {
    return {
      url: url.toString(),
      title: '',
      extractedText: '',
      fetchedAt: new Date().toISOString(),
      status: 'failed',
      message: error instanceof Error ? error.message : 'Unknown scrape error.',
    }
  }
}

export function scrapeResultToPost(result: ScrapeResult, storeId: string): PostRecord | null {
  if (result.status !== 'ok' || !result.extractedText) return null

  return {
    id: `scrape-${crypto.randomUUID()}`,
    storeId,
    source: 'scrape',
    sourceUrl: result.url,
    postedAt: result.fetchedAt,
    body: result.extractedText.slice(0, 900),
    keywords: [],
  }
}
