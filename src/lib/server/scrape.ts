import * as cheerio from 'cheerio'
import type { PostRecord, ScrapeResult } from '../types'

const blockedHostPatterns = [
  /^localhost$/i,
  /^\[?::1\]?$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /\.local$/i,
]

const defaultUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function readPositiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getFetchTimeoutMs(url: URL) {
  const standardTimeoutMs = readPositiveIntEnv('SCRAPE_FETCH_TIMEOUT_MS', 5_500)
  if (url.hostname === 'neo-bbs.com' || url.hostname.endsWith('.neo-bbs.com')) {
    const slowHostTimeoutMs = readPositiveIntEnv('SCRAPE_SLOW_HOST_TIMEOUT_MS', 8_000)
    return Math.max(standardTimeoutMs, readPositiveIntEnv('SCRAPE_NEO_FETCH_TIMEOUT_MS', slowHostTimeoutMs))
  }

  return standardTimeoutMs
}

function getFetchAttemptCount(url: URL) {
  const attempts = url.hostname === 'neo-bbs.com' || url.hostname.endsWith('.neo-bbs.com') ? readPositiveIntEnv('SCRAPE_NEO_FETCH_ATTEMPTS', 1) : 1
  return Math.max(1, Math.min(3, attempts))
}

function shouldUseReaderFirst(url: URL) {
  return (
    url.hostname === 'neo-bbs.com' ||
    url.hostname.endsWith('.neo-bbs.com') ||
    url.hostname === 'millefeuillesby.apage.jp' ||
    url.hostname.endsWith('.millefeuillesby.apage.jp')
  )
}

function readerUrlFor(url: URL) {
  return `https://r.jina.ai/http://${url.toString()}`
}

async function scrapeReadableTextViaReader(url: URL): Promise<ScrapeResult | null> {
  try {
    const response = await fetch(readerUrlFor(url), {
      redirect: 'follow',
      signal: AbortSignal.timeout(readPositiveIntEnv('SCRAPE_READER_TIMEOUT_MS', 6_000)),
      headers: {
        Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
    })
    if (!response.ok) return null

    const text = await response.text()
    const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? ''
    const content = text.split(/Markdown Content:\s*/).at(1) ?? text
    const extractedText = compactText(content)
    if (extractedText.length < 80) return null

    return {
      url: url.toString(),
      title,
      extractedText: extractedText.slice(0, 12_000),
      fetchedAt: new Date().toISOString(),
      status: 'ok',
    }
  } catch {
    return null
  }
}

function isAllowedHost(hostname: string) {
  if (blockedHostPatterns.some((pattern) => pattern.test(hostname))) return false

  const allowed = process.env.SCRAPE_ALLOWED_HOSTS?.split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  if (!allowed?.length) return true
  return allowed.includes(hostname) || allowed.some((host) => host.startsWith('*.') && hostname.endsWith(host.slice(1)))
}

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function extractReadableText($: cheerio.CheerioAPI) {
  $('script, style, noscript, iframe, svg, nav, header, footer, form, button, select, option').remove()

  const candidates = [
    'article',
    'main',
    '[role="main"]',
    '.bbs',
    '.board',
    '.thread',
    '.topic',
    '.post',
    '.comment',
    '.entry',
    '.content',
    '#content',
  ]

  const seen = new Set<string>()
  const blocks: string[] = []
  candidates.forEach((selector) => {
    $(selector).each((_, element) => {
      const text = compactText($(element).text())
      if (text.length < 40 || seen.has(text)) return
      seen.add(text)
      blocks.push(text)
    })
  })

  const source = blocks.length ? blocks.join('\n') : compactText($('body').text())
  return source
    .split(/\n+/)
    .map((line) => compactText(line))
    .filter((line) => line.length >= 20)
    .join('\n')
    .slice(0, 12_000)
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
      message: 'URL形式が不正です。',
    }
  }

  if (!['http:', 'https:'].includes(url.protocol) || !isAllowedHost(url.hostname)) {
    return {
      url: url.toString(),
      title: '',
      extractedText: '',
      fetchedAt: new Date().toISOString(),
      status: 'blocked',
      message: '安全設定により、このホストは巡回対象外です。',
    }
  }

  if (shouldUseReaderFirst(url)) {
    const readerResult = await scrapeReadableTextViaReader(url)
    if (readerResult) return readerResult
  }

  const maxAttempts = getFetchAttemptCount(url)
  let lastErrorMessage = 'Unknown scrape error.'

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const requestUrl = new URL(url)
      if (attempt > 1) requestUrl.searchParams.set('nr_retry', `${Date.now()}`)
      const response = await fetch(requestUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(getFetchTimeoutMs(url)),
        headers: {
          'User-Agent': process.env.SCRAPE_USER_AGENT || defaultUserAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        },
      })

      if (!response.ok) {
        const blocked = response.status === 401 || response.status === 403 || response.status === 429
        if (blocked || attempt === maxAttempts) {
          return {
            url: url.toString(),
            title: '',
            extractedText: '',
            fetchedAt: new Date().toISOString(),
            status: blocked ? 'blocked' : 'failed',
            message: blocked ? `取得が拒否されました（${response.status}）。` : `取得に失敗しました（${response.status}）。`,
          }
        }

        lastErrorMessage = `取得に失敗しました（${response.status}）。`
        continue
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/html')) {
        return {
          url: url.toString(),
          title: '',
          extractedText: '',
          fetchedAt: new Date().toISOString(),
          status: 'blocked',
          message: '公開HTMLページのみ巡回できます。',
        }
      }

      const html = (await response.text()).slice(0, 500_000)
      const $ = cheerio.load(html)
      const title = $('title').first().text().trim()
      const extractedText = extractReadableText($)

      return {
        url: url.toString(),
        title,
        extractedText,
        fetchedAt: new Date().toISOString(),
        status: 'ok',
      }
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : 'Unknown scrape error.'
      if (attempt < maxAttempts) continue
    }
  }

  const blockedByRuntime = lastErrorMessage === 'fetch failed' || /timeout|aborted/i.test(lastErrorMessage)
  return {
    url: url.toString(),
    title: '',
    extractedText: '',
    fetchedAt: new Date().toISOString(),
    status: blockedByRuntime ? 'blocked' : 'failed',
    message: blockedByRuntime ? '取得が拒否されたか、タイムアウトしました。' : lastErrorMessage,
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
    body: result.extractedText.slice(0, 1500),
    keywords: [],
  }
}
