import type { PostRecord, ScrapeResult } from '../types'
import { storageSafeText } from '../text'
import {
  extractBbsPageContent,
  extractApageReaderContent,
  extractHarnesCurrentCalendarPostId,
  extractHarnesPopupComments,
  extractNeoReaderContent,
  extractScarletCommentsPayload,
} from './bbs-content'

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
  const slowHost =
    url.hostname === 'neo-bbs.com' ||
    url.hostname.endsWith('.neo-bbs.com') ||
    url.hostname.endsWith('.silent-moon.net')
  if (slowHost) {
    const slowHostTimeoutMs = readPositiveIntEnv('SCRAPE_SLOW_HOST_TIMEOUT_MS', 8_000)
    const hostTimeoutMs = url.hostname.includes('neo-bbs.com')
      ? readPositiveIntEnv('SCRAPE_NEO_FETCH_TIMEOUT_MS', slowHostTimeoutMs)
      : readPositiveIntEnv('SCRAPE_LEGACY_HOST_TIMEOUT_MS', 12_000)
    return Math.max(standardTimeoutMs, hostTimeoutMs)
  }

  return standardTimeoutMs
}

function getFetchAttemptCount(url: URL) {
  if (url.hostname.endsWith('.silent-moon.net')) return 1
  const attempts =
    url.hostname === 'neo-bbs.com' || url.hostname.endsWith('.neo-bbs.com')
      ? readPositiveIntEnv('SCRAPE_NEO_FETCH_ATTEMPTS', 2)
      : readPositiveIntEnv('SCRAPE_FETCH_ATTEMPTS', 2)
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
    const compactContent = compactText(content)
    const isNeo = url.hostname === 'neo-bbs.com' || url.hostname.endsWith('.neo-bbs.com')
    const isApage = url.hostname === 'millefeuillesby.apage.jp' || url.hostname.endsWith('.millefeuillesby.apage.jp')
    const canonicalContent = isNeo
      ? extractNeoReaderContent(compactContent)
      : isApage
        ? extractApageReaderContent(compactContent)
        : ''
    if ((isNeo || isApage) && !canonicalContent) return null
    const extractedText = [canonicalContent, compactContent].filter(Boolean).join('\n')
    if (extractedText.length < 80) return null

    return {
      url: url.toString(),
      title,
      extractedText: storageSafeText(extractedText, 12_000),
      fetchedAt: new Date().toISOString(),
      status: 'ok',
    }
  } catch {
    return null
  }
}

async function scrapeRenderedHtmlViaBrowserless(url: URL): Promise<ScrapeResult | null> {
  const token = process.env.BROWSERLESS_API_TOKEN?.trim()
  if (!token) return null

  try {
    const endpoint = new URL(
      process.env.BROWSERLESS_CONTENT_ENDPOINT?.trim() || 'https://production-sfo.browserless.io/content',
    )
    endpoint.searchParams.set('token', token)
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(readPositiveIntEnv('SCRAPE_BROWSERLESS_TIMEOUT_MS', 12_000)),
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url.toString(),
        bestAttempt: true,
        rejectResourceTypes: ['image', 'media', 'font'],
      }),
    })
    if (!response.ok) return null

    const html = storageSafeText(await response.text(), 500_000)
    const page = extractBbsPageContent(html, url.toString())
    if (page.extractedText.length < 80) return null

    return {
      url: url.toString(),
      title: page.title,
      extractedText: page.extractedText,
      fetchedAt: new Date().toISOString(),
      status: 'ok',
      message: '外部ブラウザ経路で公開ページを取得しました。',
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

async function readHtmlResponse(response: Response) {
  const buffer = await response.arrayBuffer()
  const probe = new TextDecoder('latin1').decode(buffer.slice(0, 4096))
  const declaredCharset =
    response.headers.get('content-type')?.match(/charset=([^;\s]+)/i)?.[1] ||
    probe.match(/charset=["']?([^"'\s;>]+)/i)?.[1] ||
    'utf-8'
  const charset = /shift[_-]?jis|sjis|windows-31j/i.test(declaredCharset) ? 'shift_jis' : 'utf-8'
  return new TextDecoder(charset).decode(buffer)
}

function japanDateLabel(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

async function fetchHarnesCurrentPosts(url: URL, html: string) {
  const postId = extractHarnesCurrentCalendarPostId(html)
  if (!postId) return ''

  try {
    const endpoint = new URL('/wp-admin/admin-ajax.php', url)
    const body = new URLSearchParams({
      action: 'jet_popup_get_content',
      'data[forceLoad]': 'true',
      'data[customContent]': '',
      'data[popupId]': 'jet-popup-334',
      'data[isJetEngine]': 'true',
      'data[queryId]': '',
      'data[listingSource]': 'posts',
      'data[postId]': postId,
      'data[popup_id]': '334',
      'data[page_url]': url.toString(),
    })
    const response = await fetch(endpoint, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(readPositiveIntEnv('SCRAPE_HARNES_POPUP_TIMEOUT_MS', 8_000)),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': process.env.SCRAPE_USER_AGENT || defaultUserAgent,
      },
    })
    if (!response.ok) return ''
    const payload = (await response.json()) as { type?: string; content?: { content?: string } }
    if (payload.type !== 'success' || !payload.content?.content) return ''
    return extractHarnesPopupComments(payload.content.content)
  } catch {
    return ''
  }
}

async function fetchKnownHostPosts(url: URL, html: string) {
  if (/(^|\.)harnes\.tokyo$/i.test(url.hostname)) return fetchHarnesCurrentPosts(url, html)
  if (!/(^|\.)scarlet\.tokyo$/i.test(url.hostname)) return ''

  try {
    const endpoint = new URL('/api/comments', url)
    endpoint.searchParams.set('date', japanDateLabel())
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(readPositiveIntEnv('SCRAPE_SUPPLEMENTAL_TIMEOUT_MS', 5_000)),
      headers: {
        Accept: 'application/json',
        'User-Agent': process.env.SCRAPE_USER_AGENT || defaultUserAgent,
      },
    })
    if (!response.ok) return ''
    return extractScarletCommentsPayload(await response.json())
  } catch {
    return ''
  }
}

async function fetchSupplementalText(urlValue: string) {
  try {
    const url = new URL(urlValue)
    if (!['http:', 'https:'].includes(url.protocol) || !isAllowedHost(url.hostname)) return ''
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(readPositiveIntEnv('SCRAPE_SUPPLEMENTAL_TIMEOUT_MS', 5_000)),
      headers: {
        'User-Agent': process.env.SCRAPE_USER_AGENT || defaultUserAgent,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('text/html')) return ''
    const html = storageSafeText(await readHtmlResponse(response), 500_000)
    return extractBbsPageContent(html, response.url || url.toString()).extractedText
  } catch {
    return ''
  }
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
  let lastFailureStatus: ScrapeResult['status'] = 'failed'

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
        lastErrorMessage = `取得に失敗しました（${response.status}）。`
        lastFailureStatus = blocked ? 'blocked' : 'failed'
        if (blocked || attempt === maxAttempts) break
        continue
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/html')) {
        lastErrorMessage = '公開HTMLを直接取得できませんでした。'
        lastFailureStatus = 'blocked'
        break
      }

      const html = storageSafeText(await readHtmlResponse(response), 500_000)
      const page = extractBbsPageContent(html, response.url || url.toString())
      const [knownHostPosts, supplementalTexts] = await Promise.all([
        fetchKnownHostPosts(url, html),
        Promise.all(page.supplementalUrls.map(fetchSupplementalText)),
      ])
      const extractedText = storageSafeText(
        [knownHostPosts, ...supplementalTexts, page.extractedText]
        .filter((text) => text.trim())
          .join('\n'),
        24_000,
      )
      if (extractedText.length < 80) {
        lastErrorMessage = '公開ページから投稿本文を確認できませんでした。'
        lastFailureStatus = 'failed'
        break
      }

      return {
        url: url.toString(),
        title: page.title,
        extractedText,
        fetchedAt: new Date().toISOString(),
        status: 'ok',
      }
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : 'Unknown scrape error.'
      lastFailureStatus = /timeout|aborted|fetch failed/i.test(lastErrorMessage) ? 'blocked' : 'failed'
      if (attempt < maxAttempts) continue
    }
  }

  const [browserlessResult, readerResult] = await Promise.all([
    scrapeRenderedHtmlViaBrowserless(url),
    scrapeReadableTextViaReader(url),
  ])
  const fallbackResult = browserlessResult ?? readerResult
  if (fallbackResult) {
    return {
      ...fallbackResult,
      message: fallbackResult.message || '代替経路で公開ページを取得しました。',
    }
  }

  return {
    url: url.toString(),
    title: '',
    extractedText: '',
    fetchedAt: new Date().toISOString(),
    status: lastFailureStatus,
    message: lastFailureStatus === 'blocked' ? `取得が拒否されたか、タイムアウトしました。${lastErrorMessage ? ` ${lastErrorMessage}` : ''}` : lastErrorMessage,
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
    body: storageSafeText(result.extractedText, 1500),
    keywords: [],
  }
}
