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

function isObviousSpamTopicText(value: string) {
  const cyrillicCharacters = value.match(/\p{Script=Cyrillic}/gu)?.length ?? 0
  return cyrillicCharacters >= 8 || /\[url=|https?:\/\/|\bwww\./i.test(value)
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

function canonicalPost(input: { author: string; body: string; date: string; articleNo?: string; targetDate?: string }) {
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
    input.targetDate ? `対象日： ${input.targetDate}` : '',
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

export function extractHarnesCurrentCalendarPostId(html: string) {
  const $ = cheerio.load(html)
  return (
    $('.jet-calendar-week__day.current-day .jet-calendar-week__day-event[data-post-id]').first().attr('data-post-id') ||
    $('.jet-calendar-week__day-event[data-post-id]').last().attr('data-post-id') ||
    ''
  ).trim()
}

export function extractHarnesPopupComments(html: string) {
  const $ = cheerio.load(html)
  $('style, script, noscript').remove()
  const posts: string[] = []

  $('.jet-listing-grid__item[data-post-id]').each((_, element) => {
    const item = $(element)
    const raw = compactText(item.text())
    const match = raw.match(
      /^(.{0,60}?)\s*(20\d{2}[./-]\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2})\s+投稿者[:：]\s*(.{1,80}?)\s*[（(]\s*(男性|女性|カップル|複数|指定なし)?\s*[）)]\s*([\s\S]{1,1600})$/u,
    )
    if (!match) return

    const gender = match[4]?.trim()
    const author = `${match[3]?.trim() ?? ''}${gender ? `（${gender}）` : ''}`
    const post = canonicalPost({
      author,
      body: match[5] ?? '',
      date: (match[2] ?? '').replace(/[.]/g, '/'),
      articleNo: item.attr('data-post-id'),
    })
    if (post) posts.push(post)
  })

  return posts.join('\n')
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
    const body =
      card.children('p').not('.name').first().text() ||
      card.find('.message').not('.reply-comment').first().text()
    const author = card.find('.user_name').first().text()
    const genderImage = card.find('img[src*="/images/sex/"]').first().attr('src') ?? ''
    const gender =
      card.find('.sex').first().text() ||
      (/woman/i.test(genderImage)
        ? '女性'
        : /man_woman|couple/i.test(genderImage)
          ? 'カップル'
          : /man/i.test(genderImage)
            ? '男性'
            : '')
    const date = compactText(card.find('.name').first().text()).match(dateTokenPattern)?.[0] ?? ''
    const articleNo =
      card.attr('id')?.match(/(\d{3,})/)?.[1] ||
      card.find('[data-id]').first().attr('data-id')?.match(/(\d{3,})/)?.[1]
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

function extractSangoPosts($: cheerio.CheerioAPI, pageUrl: URL) {
  if (!/(^|\.)bar-sango\.com$/i.test(pageUrl.hostname)) return []

  const posts: string[] = []
  $('.bbs-post').each((_, element) => {
    const card = $(element)
    const rawAuthor = card.find('.post-author').first().clone().children().remove().end().text()
    const author = cleanAuthor(rawAuthor.replace(/^投稿者\s*[:：]\s*/i, ''))
    const genderLabel = card.find('.gender-icon').first().attr('aria-label') ?? ''
    const gender = /女/.test(genderLabel) ? '女性' : /男/.test(genderLabel) ? '男性' : ''
    const body = card.find('.post-content').first().text()
    const date = card.find('.post-date').first().text()
    const articleNo = card.attr('data-post-id') || card.attr('id')?.match(/(\d{3,})/)?.[1]
    const post = canonicalPost({
      author: [author, gender ? `（${gender}）` : ''].filter(Boolean).join(''),
      body,
      date,
      articleNo,
    })
    if (post) posts.push(post)
  })

  return posts
}

function cleanNeoAuthor(value: string) {
  const cleaned = compactText(value).replace(/^返信\s+/i, '')
  const parts = cleaned.split(' ')
  if (parts.length >= 2) {
    const avatarToken = parts[0]?.normalize('NFKC') ?? ''
    const candidate = parts.slice(1).join(' ').trim()
    if (/^neo$/i.test(candidate)) return candidate
    if (avatarToken.length <= 2 && candidate.normalize('NFKC').startsWith(avatarToken)) return candidate
  }
  return cleaned
}

export function extractNeoReaderContent(value: string) {
  const markerPattern = /\(([a-z0-9]+)\)(?:NEW\s*)?(20\d{2}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})(?:\s+\(No\.(\d+)\))?\s*[]?削除\s*/gi
  const markers = [...value.matchAll(markerPattern)].flatMap((match) => {
    const markerIndex = match.index ?? 0
    const prefixStart = Math.max(0, markerIndex - 96)
    const prefix = value.slice(prefixStart, markerIndex)
    const authorMatch = prefix.match(/(?:^|\s)((?:\S+\s+)?\S{1,40})\s*さん\s*$/u)
    if (!authorMatch || authorMatch.index == null) return []
    const leadingSpace = authorMatch[0].length - authorMatch[0].trimStart().length
    return [{
      author: cleanNeoAuthor(authorMatch[1] ?? ''),
      authorStart: prefixStart + authorMatch.index + leadingSpace,
      accountId: match[1] ?? '',
      date: match[2] ?? '',
      articleNo: match[3],
      bodyStart: markerIndex + match[0].length,
    }]
  })
  const posts: string[] = []
  let threadTargetDate = ''
  const observedYear = value.match(/20\d{2}/)?.[0] ?? String(new Date().getUTCFullYear())

  markers.forEach((marker, index) => {
    const bodyEnd = markers[index + 1]?.authorStart ?? value.length
    const body = value
      .slice(marker.bodyStart, bodyEnd)
      .replace(/\s*返信\s*$/i, '')
      .replace(/\s*Copyright ©[\s\S]*$/i, '')
      .trim()
    if (/^neo$/i.test(marker.author)) {
      const target = body.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\([^)]+\))?/)
      threadTargetDate = target
        ? `${observedYear}-${String(Number(target[1])).padStart(2, '0')}-${String(Number(target[2])).padStart(2, '0')}`
        : ''
      return
    }
    if (!marker.author) return
    if (!body) return

    const stableDate = marker.date.replace(/\D/g, '')
    const post = canonicalPost({
      author: marker.author,
      body,
      date: marker.date,
      articleNo: marker.articleNo || `neo-${marker.accountId}-${stableDate}`,
      targetDate: marker.articleNo ? undefined : threadTargetDate || undefined,
    })
    if (post) posts.push(post)
  })

  return [...new Set(posts)].join('\n')
}

function extractLegacyContributorPosts($: cheerio.CheerioAPI) {
  const posts: string[] = []

  $('dl.contributor').each((_, element) => {
    const contributor = $(element)
    const nameBlock = contributor.children('.name_block').first().length
      ? contributor.children('.name_block').first()
      : contributor.find('.name_block').first()
    const detail = contributor.children('dl').first().length
      ? contributor.children('dl').first()
      : contributor
    const author = nameBlock.find('.name').first().text()
    const gender = compactText(nameBlock.find('.sex').first().text()).replace(/^[（(]|[）)]$/g, '')
    const body = detail.find('.text').first().text()
    const date = detail.find('.time_block .date').first().text()
    const articleNo = detail.find('.time_block .number').first().text().match(/\d+/)?.[0]
    const post = canonicalPost({
      author: [author, gender ? `（${gender}）` : ''].filter(Boolean).join(''),
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

function extractZzBoardPosts($: cheerio.CheerioAPI, pageUrl: URL) {
  if (pageUrl.hostname !== 'm.z-z.jp') return []

  const posts: string[] = []
  $('.com').each((_, element) => {
    const card = $(element)
    const author = card.find('.name .namecolor').first().clone().children('.no').remove().end().text()
    const genderText = card.find('.stat').first().text()
    const gender = /♀/.test(genderText) ? '女性' : /♂/.test(genderText) ? '男性' : ''
    const date = (card.find('time').first().attr('datetime') || card.find('.time').first().text()).replace('T', ' ')
    const dateParts = date.match(/(20\d{2})-(\d{2})-(\d{2})/)
    const threadTitle = compactText(card.find('.tit').first().text() || $('title').first().text())
    const explicitMonthDay = threadTitle.match(/(\d{1,2})\s*[/-]\s*(\d{1,2})/)
    const explicitDay = explicitMonthDay ? null : threadTitle.match(/(?:^|\D)(\d{1,2})日(?:\D|$)/)
    let targetDate: string | undefined
    if (dateParts && (explicitMonthDay || explicitDay)) {
      const month = Number(explicitMonthDay?.[1] ?? dateParts[2])
      const day = Number(explicitMonthDay?.[2] ?? explicitDay?.[1])
      targetDate = `${dateParts[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    } else if (dateParts && /明日/.test(threadTitle)) {
      const next = new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]) + 1, 12))
      targetDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
    } else if (dateParts) {
      const weekdayIndex = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'].findIndex((label) => threadTitle.includes(label))
      if (weekdayIndex >= 0) {
        const postedDate = new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]), 12))
        const offset = (weekdayIndex - postedDate.getUTCDay() + 7) % 7
        postedDate.setUTCDate(postedDate.getUTCDate() + offset)
        targetDate = `${postedDate.getUTCFullYear()}-${String(postedDate.getUTCMonth() + 1).padStart(2, '0')}-${String(postedDate.getUTCDate()).padStart(2, '0')}`
      }
    }
    const articleNo = card.find('.edit a[href*="no="]').first().attr('href')?.match(/[?&]no=(\d+)/)?.[1]
    const post = canonicalPost({
      author: [author, gender ? `（${gender}）` : ''].filter(Boolean).join(''),
      body: card.find('.texts').first().text(),
      date,
      articleNo,
      targetDate,
    })
    if (post) posts.push(post)
  })

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
    $('a.bbp-topic-permalink[href]').each((_, element) => {
      const href = $(element).attr('href')
      if (!href || !/\/forums\/topic\//i.test(href)) return
      const topicRow = $(element).closest('ul[id^="bbp-topic-"]').first()
      const topicText = compactText(
        topicRow.text()
        || $(element).attr('title')
        || $(element).closest('li').text()
        || $(element).parent().text()
        || $(element).text(),
      )
      if (isObviousSpamTopicText(topicText)) return
      add(href)
    })
  }

  if (pageUrl.hostname === 'rara.jp' && /^\/[^/]+\/?$/i.test(pageUrl.pathname)) {
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href')
      if (href && /(?:^|\/)page\d+(?:[?#].*)?$/i.test(href)) add(href)
    })
  }

  if (pageUrl.hostname === 'm.z-z.jp') {
    $('a[href*="thbbs.cgi"]').each((_, element) => add($(element).attr('href')))
  }

  if (pageUrl.hostname === 'harnes.tokyo' && pageUrl.pathname === '/event-calendar/') {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(now)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
    const todayPath = `/event/${part('year')}-${part('month')}-${part('day')}`
    $(`a[href*="${todayPath}"]`).each((_, element) => add($(element).attr('href')))
  }

  $('iframe[src]').each((_, element) => {
    const src = $(element).attr('src')
    if (src && /(bbs|board|forum|message|thread)/i.test(src)) add(src)
  })

  return urls.slice(0, pageUrl.hostname === 'm.z-z.jp' ? 12 : 3)
}

export function extractBbsPageContent(html: string, urlValue: string) {
  const $ = cheerio.load(html)
  const pageUrl = new URL(urlValue)
  const sangoPosts = extractSangoPosts($, pageUrl)
  const legacyContributorPosts = extractLegacyContributorPosts($)
  const canonicalPosts = sangoPosts.length
    ? sangoPosts
    : legacyContributorPosts.length
      ? legacyContributorPosts
      : [
        ...extractWordPressComments($),
        ...extractBbPressReplies($),
        ...extractMessageCards($),
        ...extractDatedArticlePosts($),
        ...extractYybbsPosts($, pageUrl),
        ...extractRaraPosts($, pageUrl),
        ...extractZzBoardPosts($, pageUrl),
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
