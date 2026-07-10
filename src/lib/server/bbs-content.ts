import * as cheerio from 'cheerio'

const canonicalPostStart = '[[NR_POST]]'
const canonicalPostEnd = '[[/NR_POST]]'
const fullDateSource =
  '20\\d{2}(?:年|[./-])\\s*\\d{1,2}(?:月|[./-])\\s*\\d{1,2}日?(?:\\([^)]+\\))?\\s*\\d{1,2}(?:[:：時]\\s*\\d{1,2})(?::\\d{1,2})?\\s*(?:AM|PM)?'
const dateTokenPattern =
  /\d{1,2}月\s*\d{1,2},?\s*20\d{2}\s*\d{1,2}:\d{1,2}\s*(?:AM|PM)|20\d{2}(?:年|[./-])\s*\d{1,2}(?:月|[./-])\s*\d{1,2}日?(?:\([^)]+\))?\s*\d{1,2}(?:[:：時]\s*\d{1,2})(?::\d{1,2})?\s*(?:AM|PM)?|\d+\s*日(?:、|,)?\s*\d+\s*時間(?:、|,)?\s*\d+\s*分前|\d+\s*時間(?:、|,)?\s*\d+\s*分前|\d+\s*分前|たった今|数秒前/i

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function cleanAuthor(value: string) {
  return compactText(value)
    .replace(/\s*より[:：]?\s*$/, '')
    .replace(/\s*(?:来店予告済み|キーマスター|モデレーター|参加者|ゲスト)\s*$/i, '')
    .trim()
}

function cleanBody(value: string) {
  return compactText(value)
    .replace(/^あなたのコメントは管理者の承認待ちです。これはプレビューで、コメントは承認後に表示されます。\s*/i, '')
    .replace(/\s*(?:返信|編集・削除)\s*$/i, '')
    .trim()
}

function canonicalPost(input: { author: string; body: string; date: string; articleNo?: string }) {
  const author = cleanAuthor(input.author)
  const body = cleanBody(input.body)
  const date = compactText(input.date)
  if (!author || !body || !date) return ''

  return [
    canonicalPostStart,
    `投稿者： ${author}`,
    body,
    `投稿日： ${date}`,
    input.articleNo ? `記事番号： ${input.articleNo}` : '',
    canonicalPostEnd,
  ]
    .filter(Boolean)
    .join('\n')
}

function formatJapanTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`
}

export function extractScarletCommentsPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const data = 'data' in payload && Array.isArray(payload.data) ? payload.data : []

  return data
    .map((value) => {
      if (!value || typeof value !== 'object') return ''
      const row = value as Record<string, unknown>
      if (row.isStaffReply === true || String(row.name ?? '').trim().toUpperCase() === 'STAFF') return ''
      return canonicalPost({
        author: String(row.name ?? ''),
        body: String(row.body ?? ''),
        date: formatJapanTimestamp(String(row.createdAt ?? '')),
        articleNo: String(row.commentId ?? ''),
      })
    })
    .filter(Boolean)
    .join('\n')
}

function extractWordPressComments($: cheerio.CheerioAPI) {
  const posts: string[] = []

  $('.comment-body').each((_, element) => {
    const raw = compactText($(element).text())
    const authorMatch = raw.match(/^(.{1,80}?)\s+より[:：]/)
    const dateMatch = raw.match(dateTokenPattern)
    if (!authorMatch || !dateMatch || dateMatch.index == null) return

    const bodyStart = dateMatch.index + dateMatch[0].length
    const post = canonicalPost({
      author: authorMatch[1] ?? '',
      date: dateMatch[0],
      body: raw.slice(bodyStart),
      articleNo: $(element).closest('[id]').attr('id')?.match(/(\d{3,})/)?.[1],
    })
    if (post) posts.push(post)
  })

  return posts
}

function extractBbPressReplies($: cheerio.CheerioAPI) {
  const posts: string[] = []

  $('.bbp-reply-content').each((_, element) => {
    const content = $(element)
    const wrapper = content.parent()
    const rawBody = cleanBody(content.text())
    if (!rawBody || rawBody === '投稿') return

    const author =
      wrapper.find('.bbp-author-name').first().text() ||
      wrapper.find('.bbp-reply-author').first().text()
    const header = wrapper.prev('.bbp-reply-header')
    const headerText = compactText(header.text())
    const date = header.find('.bbp-reply-post-date').first().text() || headerText.match(dateTokenPattern)?.[0] || ''
    const articleNo = headerText.match(/#(\d{3,})/)?.[1] || wrapper.attr('class')?.match(/post-(\d{3,})/)?.[1]
    const post = canonicalPost({ author, body: rawBody, date, articleNo })
    if (post) posts.push(post)
  })

  return posts
}

function extractInlineDatedPosts($: cheerio.CheerioAPI) {
  const posts: string[] = []
  const text = compactText($('body').text())
  const pattern = new RegExp(
    `(?:投稿者|名前|Name)[:：]\\s*(.{1,80}?)\\s+(${fullDateSource})\\s+([\\s\\S]{2,1200}?)(?=\\s+(?:投稿者[:：]|返信(?:\\s|$)|編集・削除|投稿日[:：]|$))`,
    'gi',
  )

  for (const match of text.matchAll(pattern)) {
    const post = canonicalPost({
      author: match[1] ?? '',
      date: match[2] ?? '',
      body: match[3] ?? '',
    })
    if (post) posts.push(post)
  }

  return posts
}

function extractMessageCards($: cheerio.CheerioAPI) {
  const posts: string[] = []

  $('.main-comment').each((_, element) => {
    const card = $(element)
    const body = card.find('.message').first().text()
    const author = card.find('.user_name').first().text()
    const gender = card.find('.sex').first().text()
    const date = compactText(card.find('.name').first().text()).match(dateTokenPattern)?.[0] ?? ''
    const articleNo = card.attr('id')?.match(/(\d{3,})/)?.[1]
    const post = canonicalPost({
      author: [author, gender ? `（${compactText(gender)}）` : ''].filter(Boolean).join(''),
      body,
      date,
      articleNo,
    })
    if (post) posts.push(post)
  })

  return posts
}

function extractDatedArticlePosts($: cheerio.CheerioAPI) {
  const posts: string[] = []
  const text = compactText($('body').text())
  const pattern = new RegExp(
    `(${fullDateSource})\\s*[［[]\\s*記事No[:：]\\s*(\\d{3,})\\s*[］\\]]\\s*投稿者[:：]\\s*(.{1,40}?)\\s*(男性|女性|カップル|指定なし)\\s*([\\s\\S]{2,1200}?)(?=\\s*返信する|$)`,
    'gi',
  )

  for (const match of text.matchAll(pattern)) {
    const post = canonicalPost({
      date: match[1] ?? '',
      articleNo: match[2],
      author: `${match[3] ?? ''}（${match[4] ?? '指定なし'}）`,
      body: match[5] ?? '',
    })
    if (post) posts.push(post)
  }

  return posts
}

function extractYybbsPosts($: cheerio.CheerioAPI, pageUrl: URL) {
  const posts: string[] = []
  const isSilentMoon = pageUrl.hostname.endsWith('silent-moon.net')
  const add = (input: { author: string; body: string; date: string; articleNo?: string }) => {
    const author = cleanAuthor(input.author)
    if (isSilentMoon && /^(ATOM|Misa|silent\s*moon)$/i.test(author)) return
    const post = canonicalPost({ ...input, author })
    if (post) posts.push(post)
  }

  $('.art').each((_, element) => {
    const article = $(element)
    const directInfo = article.children('.art-info').first()
    add({
      author: directInfo.find('b').first().text(),
      date: directInfo.find('.num').first().text(),
      body: article.children('p').first().text(),
      articleNo: article.find('.rep_button a').first().attr('href')?.match(/[?&]res=(\d+)/)?.[1],
    })

    article.children('.reslog').each((__, replyElement) => {
      const reply = $(replyElement)
      const info = reply.find('.art-info').first()
      add({
        author: info.find('b').first().text(),
        date: info.find('.num').first().text(),
        body: reply.find('.rescom').first().text(),
      })
    })
  })

  return posts
}

function extractRaraPosts($: cheerio.CheerioAPI, pageUrl: URL) {
  if (pageUrl.hostname !== 'rara.jp') return []

  const posts: string[] = []
  const boardId = pageUrl.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? ''
  const isStaffAuthor = (author: string) => {
    const normalized = cleanAuthor(author)
    if (boardId === 'bar440') return /^440$/i.test(normalized)
    if (boardId === 'zeus') return /^(シン|メイ|club\s*zeus)$/i.test(normalized)
    return false
  }
  const add = (input: { author: string; body: string; date: string; articleNo?: string }) => {
    if (isStaffAuthor(input.author)) return
    const post = canonicalPost(input)
    if (post) posts.push(post)
  }

  $('.user-box').each((_, element) => {
    const userBox = $(element)
    const container = userBox.parent()
    const bodyContainer = userBox.nextAll('.spc').first().length
      ? userBox.nextAll('.spc').first()
      : container.find(':scope > .spc').first()
    const meta = userBox.find('.user-meta').first().text()
    add({
      author: userBox.find('.user-name').first().text(),
      date: meta.match(dateTokenPattern)?.[0] ?? '',
      body: bodyContainer.find('.mainText').first().text(),
      articleNo: meta.match(/No[.\s]*(\d+)/i)?.[1] || container.attr('id')?.match(/(\d+)/)?.[1],
    })
  })

  if (!$('.user-box').length) {
    $('.mainText').each((_, element) => {
      const bodyElement = $(element)
      const contentLayer = bodyElement.closest('.layer')
      const info = contentLayer.find('div[style*="float:left"]').first()
      const headerLayer = contentLayer.prev('.layer')
      const headerText = compactText(headerLayer.text())
      const infoText = compactText(info.text())
      add({
        author: info.find('b').first().text(),
        date: infoText.match(dateTokenPattern)?.[0] ?? '',
        body: bodyElement.text(),
        articleNo: headerLayer.attr('id')?.match(/(\d+)/)?.[1] || headerText.match(/No[.\s]*(\d+)/i)?.[1],
      })
    })
  }

  return posts
}

function extractGeneralText($: cheerio.CheerioAPI) {
  const content = cheerio.load($.html())
  content('script, style, noscript, iframe, svg, nav, header, footer, form, button, select, option').remove()

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
    content(selector).each((_, element) => {
      const text = compactText(content(element).text())
      if (text.length < 40 || seen.has(text)) return
      seen.add(text)
      blocks.push(text)
    })
  })

  return blocks.length ? blocks.join('\n') : compactText(content('body').text())
}

function discoverSupplementalUrls($: cheerio.CheerioAPI, pageUrl: URL) {
  const urls: string[] = []
  const seen = new Set<string>([pageUrl.toString()])
  const add = (value: string | undefined) => {
    if (!value) return
    try {
      const resolved = new URL(value, pageUrl)
      if (!['http:', 'https:'].includes(resolved.protocol) || seen.has(resolved.toString())) return
      seen.add(resolved.toString())
      urls.push(resolved.toString())
    } catch {
      return
    }
  }

  const isTopicIndex = /\/topics\/?$/i.test(pageUrl.pathname)
  const isForumIndex = /\/forums\/forum\//i.test(pageUrl.pathname)
  if (isTopicIndex) {
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href')
      if (href && /\/topics\/\d+\/?(?:[?#].*)?$/i.test(href)) add(href)
    })
  }
  if (isForumIndex) {
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href')
      if (href && /\/forums\/topic\//i.test(href)) add(href)
    })
  }

  if (pageUrl.hostname === 'rara.jp' && /^\/[^/]+\/?$/i.test(pageUrl.pathname)) {
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href')
      if (href && /(?:^|\/)page\d+(?:[?#].*)?$/i.test(href)) add(href)
    })
  }

  $('iframe[src]').each((_, element) => {
    const src = $(element).attr('src')
    if (src && /(bbs|board|forum|message|thread)/i.test(src)) add(src)
  })

  return urls.slice(0, 3)
}

export function extractBbsPageContent(html: string, urlValue: string) {
  const $ = cheerio.load(html)
  const pageUrl = new URL(urlValue)
  const canonicalPosts = [
    ...extractWordPressComments($),
    ...extractBbPressReplies($),
    ...extractMessageCards($),
    ...extractDatedArticlePosts($),
    ...extractYybbsPosts($, pageUrl),
    ...extractRaraPosts($, pageUrl),
    ...extractInlineDatedPosts($),
  ]
  const canonicalText = [...new Set(canonicalPosts)].join('\n')
  const generalText = extractGeneralText($)

  return {
    title: $('title').first().text().trim(),
    extractedText: [canonicalText, generalText].filter(Boolean).join('\n').slice(0, 24_000),
    supplementalUrls: discoverSupplementalUrls($, pageUrl),
  }
}
