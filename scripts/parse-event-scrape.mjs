import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const writeCanonical = process.argv.includes('--write-canonical')
const resultPath = process.argv.slice(2).find((argument) => !argument.startsWith('--'))
if (!resultPath) {
  throw new Error('Usage: node scripts/parse-event-scrape.mjs <output/event-scrape/.../results.json> [--write-canonical]')
}

const jpWeekdays = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜']
function pad(value) {
  return String(value).padStart(2, '0')
}

function isoDate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function weekdayFor(date) {
  const parsed = new Date(`${date}T00:00:00+09:00`)
  if (Number.isNaN(parsed.getTime())) return '未設定'
  return jpWeekdays[parsed.getDay()]
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/[〜～]/g, '～')
    .trim()
}

function linesFromText(text) {
  return normalizeText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function slug(value) {
  const normalized = String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/bar|club|tokyo|shibuya/g, '')
    .replace(/[^a-z0-9ぁ-んァ-ン一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return normalized || 'event'
}

function cleanTitle(value) {
  return normalizeText(value)
    .replace(/^イベント\s*/i, '')
    .replace(/^開催予定\s*/i, '')
    .replace(/^開催\s*[—–-]\s*/, '')
    .replace(/^0\s+/, '')
    .replace(/[★☆◆◇●○]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)
}

function titleIsNoise(value) {
  const line = cleanTitle(value)
  if (!line) return true
  if (/^(HOME|EVENT|SYSTEM|BBS|ACCESS|GALLERY|CONTACT|FAQ|TOPICS|COLUMN|LINK|イベント|カレンダー|Event|CALENDER|Calendar)$/i.test(line)) return true
  if (/^(月|火|水|木|金|土|日|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/i.test(line)) return true
  if (/^(トップ|ホーム|システム|掲示板|アクセス|写真|会員登録|ビューのナビゲーション)$/.test(line)) return true
  if (/^(営業時間|料金|入場料|お問い合わせ|本日のご来店予告|WARNING|Proudly powered)/i.test(line)) return true
  if (/^20歳未満|^18歳未満|^©|^Skip to content/i.test(line)) return true
  if (/^(～イベント内容～|～キャンペーン内容～|～開催日～|～実施日～)$/.test(line)) return true
  if (/^\d{4}年\d{1,2}月のイベント情報$/.test(line)) return true
  if (/^\d{2}\s*月のイベント情報$/.test(line)) return true
  if (/^(更新中|準備中)[。.・…]*$/.test(line)) return true
  return false
}

function isBadEventTitle(value) {
  const title = cleanTitle(value).normalize('NFKC')
  if (!title) return true
  if (/^(公式イベント|一覧へ|イベント一覧へ|閉じる|close)$/i.test(title)) return true
  if (/^(キャンペーン情報|特別企画|The special event)$/i.test(title)) return true
  if (/^[・(（]/.test(title)) return true
  if (/^(?:[日月火水木金土]曜日)(?:・[日月火水木金土]曜日)*$/.test(title)) return true
  if (/^(Coming soon|通常営業)$/i.test(title)) return true
  if (/^(この日は|夜の部に|昼の部に|一口サイズ|東京都|上野・御徒町|昼＋夜どちらも|超！お得|今夜は私から|これぞまさに|ハニトラの夜|アフター5|自分一人)/.test(title)) return true
  if (/^(メンバーズバー|CAMPO BAR)$/.test(title)) return true
  if (/お過ごしください|ご入店頂け|本物のメンバーズバー|ラグジュアリーな空間/.test(title)) return true
  if (/^\d{1,2}\s*:?\s*\d{0,2}\s*～/.test(title)) return true
  if (/^(00|0|1部|2部|3部)$/.test(title)) return true
  if (/HOME\|/.test(title)) return true
  if (/^HOME\s*[>»]/i.test(title)) return true
  if (/次回のコメント|誹謗中傷|当掲示板|問い合わせ|20歳未満|保存する/.test(title)) return true
  if (/^(単独|カップル|男性様|女性様|BBS|前日|当日|さらに|更に|フリータイム|入場料|通常有料|上記|※|【PICK】)/.test(title)) return true
  if (/^ご新規/.test(title) && !/(day|キャンペーン|割引|半額)/i.test(title)) return true
  if (/^キャンペーン$/.test(title)) return true
  if (/。|ませんか|ください|頂戴|いただ|させて|ご案内|お待ち|期待させ|サポート/.test(title)) return true
  if (/飲み放題！.*毎日開催/.test(title)) return true
  if (title.length > 74 && /。|！|♪|ます|です/.test(title)) return true
  return false
}

function findTitleBefore(lines, index) {
  for (let i = index - 1; i >= 0 && i >= index - 16; i -= 1) {
    const line = cleanTitle(lines[i])
    if (/^～/.test(line)) break
    if (/^\d{1,2}(?:[\/月]|\s*日)/.test(line)) continue
    if (/^(単独|カップル|女性|男性|ご新規|BBS|前日|当日|さらに|※|フリータイム|入場料)/.test(line)) continue
    if (/飲み放題|サービス|入会金|料金|軽食|割引|OFF|無料|プレゼント/.test(line)) continue
    if (titleIsNoise(line) || isBadEventTitle(line)) continue

    if (/^[&＆]/.test(line)) {
      for (let j = i - 1; j >= 0 && j >= i - 4; j -= 1) {
        const previous = cleanTitle(lines[j])
        if (titleIsNoise(previous) || isBadEventTitle(previous)) continue
        return cleanTitle(`${previous} ${line}`)
      }
    }

    return line
  }
  return '公式イベント'
}

function findTitleAfterDateLine(lines, index) {
  for (let i = index + 1; i < lines.length && i < index + 8; i += 1) {
    const line = cleanTitle(lines[i])
    if (titleIsNoise(line) || isBadEventTitle(line)) continue
    if (/^\d{1,2}[\/月]/.test(line)) continue
    return line
  }
  return '公式イベント'
}

function findMarkerHeading(lines, markerIndex) {
  for (let index = markerIndex - 1; index >= 0 && index >= markerIndex - 12; index -= 1) {
    const title = cleanTitle(lines[index])
    if (/^～/.test(title)) break
    if (/^\d{1,2}(?:[\/月]|\s*日)/.test(title)) continue
    if (/^(?:[日月火水木金土]曜日)(?:・[日月火水木金土]曜日)*$/.test(title)) continue
    if (titleIsNoise(title)) continue
    if (/^[&＆]/.test(title)) {
      const previous = cleanTitle(lines[index - 1] || '')
      if (!titleIsNoise(previous)) return cleanTitle(`${previous} ${title}`)
    }
    return title
  }
  return findTitleBefore(lines, markerIndex)
}

function findTitleForMarker(lines, markerIndex, source) {
  if (source.storeId === 'honey-trap' && /～実施日～/.test(lines[markerIndex])) {
    let contentStart = 0
    let contentMarker = -1
    for (let index = markerIndex - 1; index >= 0; index -= 1) {
      if (/～(?:イベント内容|キャンペーン内容)～/.test(lines[index])) {
        contentStart = index + 1
        contentMarker = index
        break
      }
    }
    if (contentMarker >= 0) {
      const nearbyTitle = validTitleCandidate(lines[contentMarker - 1] || '')
      if (
        nearbyTitle &&
        !/^キャンペーン情報$/.test(nearbyTitle) &&
        /(day|party|イベント|祭|night|朝|昼|レディース|キャンペーン|割引|Yシャツ|スーツ|じゃんけん)/i.test(nearbyTitle)
      ) return nearbyTitle
    }
    for (let index = contentStart; index < markerIndex; index += 1) {
      const title = validTitleCandidate(lines[index])
      if (title) return title
    }
  }
  if (source.storeId === 'campo-bar' && /～実施日～/.test(lines[markerIndex])) {
    let sectionStart = 0
    for (let index = markerIndex - 1; index >= 0; index -= 1) {
      if (/～実施日～/.test(lines[index])) {
        sectionStart = index + 1
        break
      }
    }

    const specialIndex = lines.findLastIndex((line, index) => index >= sectionStart && index < markerIndex && /^特別企画$/.test(line))
    if (specialIndex >= sectionStart) sectionStart = specialIndex + 1

    for (let index = sectionStart; index < markerIndex; index += 1) {
      const line = cleanTitle(lines[index])
      if (/^(?:\d{1,2}[\/／.]\d{1,2}|\d{1,2}月\d{1,2}日|\d{1,2}日)/.test(line)) continue
      if (titleIsNoise(line) || isBadEventTitle(line)) continue
      return line
    }
  }
  return findMarkerHeading(lines, markerIndex)
}

function parseStartTime(value) {
  const normalized = String(value).normalize('NFKC').replace(/[：]/g, ':')
  const match = normalized.match(/(\d{1,2})\s*:\s*(\d{2})/)
  if (!match) {
    if (/10時|10\s*時/.test(normalized)) return '10:00'
    if (/13時|13\s*時|昼の部/.test(normalized)) return '13:00'
    if (/18時|18\s*時/.test(normalized)) return '18:00'
    if (/19時|19\s*時|夜の部/.test(normalized)) return '19:00'
    if (/22時|22\s*時/.test(normalized)) return '22:00'
    return ''
  }
  return `${pad(match[1])}:${match[2]}`
}

function sessionFor(title, line, startTime = '') {
  const text = `${title} ${line}`.normalize('NFKC')
  if (/昼|朝|10:00|13:00|10時|13時/.test(text)) return 'day'
  const hour = Number(startTime.slice(0, 2))
  if (!Number.isNaN(hour) && hour > 0 && hour < 17) return 'day'
  return 'night'
}

function categoryFor(title, details = '') {
  const text = `${title} ${details}`
  if (/周年|誕生日|バースデ|Birthday|聖誕|感謝祭/i.test(text)) return '記念日'
  if (/初心|ビギナー|初めて|はじめて/i.test(text)) return '初心者'
  if (/女性|女祭|レディース|ONAGO|単女/i.test(text)) return '女性特典'
  if (/昼|朝|ランチ|朝活|昼顔/i.test(text)) return '昼イベント'
  if (/ビール|シャンパン|カクテル|ワイン|飲み放題|オードブル|フード|軽食|おでん/i.test(text)) return '飲食'
  if (/コス|バニー|チャイナ|ナース|浴衣|水着|ビキニ|ランジェリー|制服|Yシャツ|メガネ/i.test(text)) return '衣装'
  if (/SM|フェチ|緊縛|ダーツ|スポーツ|ビンゴ|ポールダンス/i.test(text)) return '企画'
  return '公式イベント'
}

function detailTags(chunk, title = '') {
  const text = `${title}\n${chunk.join('\n')}`.normalize('NFKC')
  const tags = []
  if (/BBS|来店予告|書き込み/.test(text)) tags.push('来店予告特典あり')
  if (/レディース|女性|単独女性|女祭|ONAGO/i.test(text)) tags.push('女性向け特典あり')
  if (/飲み放題|フリー|ビール|カクテル|シャンパン|ワイン/i.test(text)) tags.push('ドリンク特典あり')
  if (/軽食|フード|オードブル|ランチ|おでん|ピザ/i.test(text)) tags.push('軽食・フード表記あり')
  if (/初めて|初心|ビギナー|ご新規/i.test(text)) tags.push('初回向け表記あり')
  if (/昼|朝|10:00|13:00|昼の部/i.test(text)) tags.push('昼枠')
  if (/夜|18:00|19:00|22:00|翌|05:00|06:00/i.test(text)) tags.push('夜枠')
  return [...new Set(tags)].slice(0, 4)
}

function buildDetails(title, dateLine, chunk, fallback = '公式ページに掲載されたイベントです。') {
  const tags = detailTags(chunk, title)
  const time = parseStartTime(dateLine)
  const prefix = time ? `開始 ${time}` : ''
  const body = tags.length ? tags.join(' / ') : fallback
  return [prefix, body].filter(Boolean).join('。').slice(0, 180)
}

function parseJapaneseDateList(value, defaultYear, defaultMonth, options = {}) {
  const dates = []
  let month = defaultMonth
  const normalized = String(value).normalize('NFKC')
  const regex = /(?:(\d{1,2})\s*月)?\s*(\d{1,2})\s*日/g
  for (const match of normalized.matchAll(regex)) {
    if (!match[1] && !options.allowDayOnly) continue
    if (!match[1] && /日目/.test(normalized.slice(match.index, match.index + match[0].length + 1))) continue
    if (match[1]) month = Number(match[1])
    const day = Number(match[2])
    if (month === defaultMonth && day >= 1 && day <= 31) {
      dates.push({ date: isoDate(defaultYear, month, day), raw: match[0] })
    }
  }
  return dates
}

function parseSlashDates(value, defaultYear, defaultMonth) {
  const normalized = String(value).normalize('NFKC')
  const dates = []
  const regex = /(\d{1,2})\s*[\/／]\s*(\d{1,2})/g
  for (const match of normalized.matchAll(regex)) {
    const month = Number(match[1])
    const day = Number(match[2])
    if (month === defaultMonth && day >= 1 && day <= 31) {
      dates.push({ date: isoDate(defaultYear, month, day), raw: match[0] })
    }
  }
  return dates
}

function parseDotDates(value, defaultYear, defaultMonth) {
  const normalized = String(value).normalize('NFKC')
  const dates = []
  const regex = /(?:^|\s)(\d{1,2})\s*\.\s*(\d{1,2})(?:\s|$)/g
  for (const match of normalized.matchAll(regex)) {
    const month = Number(match[1])
    const day = Number(match[2])
    if (month === defaultMonth && day >= 1 && day <= 31) {
      dates.push({ date: isoDate(defaultYear, month, day), raw: match[0].trim() })
    }
  }
  return dates
}

function hasDateMention(value, options = {}) {
  const normalized = String(value).normalize('NFKC')
  if (/(\d{1,2}\s*[\/／.]\s*\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*日)/.test(normalized)) return true
  return Boolean(options.allowDayOnly && /^\s*\d{1,2}\s*日(?!目)/.test(normalized))
}

function parseDateMentions(value, defaultYear, defaultMonth, options = {}) {
  const byDate = new Map()
  for (const parsed of [
    ...parseSlashDates(value, defaultYear, defaultMonth),
    ...parseJapaneseDateList(value, defaultYear, defaultMonth, options),
    ...parseDotDates(value, defaultYear, defaultMonth),
  ]) {
    byDate.set(parsed.date, parsed)
  }
  return [...byDate.values()]
}

function stripDateTokens(value) {
  return cleanTitle(value)
    .replace(/\d{1,2}\s*[\/／.]\s*\d{1,2}\s*(?:\([^)]*\)|（[^）]*）)?/g, ' ')
    .replace(/(?:\d{1,2}\s*月\s*)?\d{1,2}\s*日\s*(?:\([^)]*\)|（[^）]*）)?/g, ' ')
    .replace(/\d{2}:\d{2}\s*[～~-]\s*\d{1,2}:\d{2}/g, ' ')
    .replace(/^[&＆・\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function datePartsFromMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  return { year, monthNumber }
}

function reconcileTitleWeekday(value, date) {
  const title = cleanTitle(value)
  const match = title.match(/^([日月火水木金土])曜日\s*/)
  if (!match) return title
  const actualWeekday = weekdayFor(date)
  if (`${match[1]}曜` === actualWeekday) return title
  return title.slice(match[0].length).trim()
}

function addEvent(events, source, partial) {
  const title = reconcileTitleWeekday(partial.title, partial.date)
  if (!title || titleIsNoise(title) || isBadEventTitle(title)) return
  const startsAt = partial.startsAt || parseStartTime(partial.dateLine || '') || (partial.session === 'day' ? '13:00' : '19:00')
  const session = partial.session || sessionFor(title, partial.dateLine || '', startsAt)
  const category = partial.category || categoryFor(title, partial.details)
  const id = `${source.storeId}-${partial.date}-${startsAt || session}-${slug(title)}`

  events.push({
    id,
    storeId: source.storeId,
    date: partial.date,
    weekday: weekdayFor(partial.date),
    startsAt,
    session,
    category,
    title,
    details: normalizeText(partial.details || buildDetails(title, partial.dateLine || '', partial.chunk || [])),
    sourceUrl: source.url,
  })
}

function parseMarkerSections(events, source, lines) {
  const { year, monthNumber } = datePartsFromMonth(source.month)
  const markers = ['～開催日～', '～実施日～']
  for (let index = 0; index < lines.length; index += 1) {
    if (!markers.some((marker) => lines[index].includes(marker))) continue
    const markerLine = lines[index]
    const titleBefore = findTitleForMarker(lines, index, source)
    const dateLines = []
    const allowDayOnly = true
    if (hasDateMention(markerLine, { allowDayOnly })) {
      dateLines.push({ line: markerLine, index })
    }
    let contentStart = -1
    for (let i = index + 1; i < lines.length; i += 1) {
      if (i > index + 12) break
      if (i > index + 1 && /～(開催日|実施日)～/.test(lines[i])) break
      if (/～(イベント内容|キャンペーン内容)～/.test(lines[i])) {
        contentStart = i + 1
        break
      }
      if (hasDateMention(lines[i], { allowDayOnly })) {
        dateLines.push({ line: lines[i], index: i })
        continue
      }
      if (/～実施日～/.test(markerLine) && dateLines.length) break
      if (i > index + 3 && /^(HOME|Event|イベント|The special event)$/i.test(lines[i])) break
    }

    const chunk = []
    if (contentStart > 0) {
      for (let i = contentStart; i < lines.length && i < contentStart + 40; i += 1) {
        if (/～(開催日|実施日|イベント内容|キャンペーン内容)～/.test(lines[i])) break
        chunk.push(lines[i])
      }
    }
    for (const dateLine of dateLines) {
      const line = dateLine.line
      const title = titleBefore
      const dates = parseDateMentions(line, year, monthNumber, { allowDayOnly })
      for (const parsed of dates) {
        addEvent(events, source, {
          title,
          date: parsed.date,
          dateLine: line,
          startsAt: parseStartTime(line),
          session: sessionFor(title, line),
          details: buildDetails(title, line, chunk),
          chunk,
        })
      }
    }
  }
}

function parseTitleContentDateSections(events, source, lines) {
  const { year, monthNumber } = datePartsFromMonth(source.month)
  for (let index = 0; index < lines.length; index += 1) {
    if (!/～(イベント内容|キャンペーン内容)～/.test(lines[index])) continue
    const title = findTitleBefore(lines, index)
    const chunk = []
    for (let i = index + 1; i < lines.length && i < index + 10; i += 1) {
      if (i > index + 2 && /～(イベント内容|キャンペーン内容)～/.test(lines[i])) break
      if (/～(開催日|実施日)～/.test(lines[i])) break
      chunk.push(lines[i])
    }

    const dateLines = chunk.filter(hasDateMention)
    for (const line of dateLines.slice(0, 3)) {
      const dates = parseDateMentions(line, year, monthNumber)
      for (const parsed of dates) {
        addEvent(events, source, {
          title,
          date: parsed.date,
          dateLine: line,
          startsAt: parseStartTime(line),
          session: sessionFor(title, line),
          details: buildDetails(title, line, chunk),
          chunk,
        })
      }
    }
  }
}

function parseInlineJapaneseEvents(events, source, lines) {
  const { year, monthNumber } = datePartsFromMonth(source.month)
  for (const line of lines) {
    if (!hasDateMention(line)) continue
    if (!/[：:]/.test(line) && !/(月|火|水|木|金|土|日)曜日/.test(line)) continue
    const dates = parseDateMentions(line, year, monthNumber)
    if (!dates.length) continue
    const titlePart = line.split(/[：:]/).slice(1).join('：') || line.replace(/^.*?\d{1,2}\s*日[^\s　]*/, '')
    const title = cleanTitle(titlePart.replace(/^\s*(昼の部|夜の部)\s*/, ''))
    if (titleIsNoise(title)) continue
    for (const parsed of dates) {
      addEvent(events, source, {
        title,
        date: parsed.date,
        dateLine: line,
        startsAt: parseStartTime(line),
        session: sessionFor(title, line),
        details: buildDetails(title, line, [line], '公式ページの一覧に掲載されたイベントです。'),
      })
    }
  }
}

function validTitleCandidate(value) {
  const title = cleanTitle(value).replace(/[。.]+$/, '')
  if (!title || titleIsNoise(title) || isBadEventTitle(title)) return ''
  if (hasDateMention(title) && !stripDateTokens(title)) return ''
  return title
}

function parseTrailingDateSections(events, source, lines) {
  const { year, monthNumber } = datePartsFromMonth(source.month)
  const dateIndexes = lines
    .map((line, index) => ({ line, index, dates: parseDateMentions(line, year, monthNumber) }))
    .filter((entry) => entry.dates.length && /(昼の部|夜の部|\d{1,2}\s*:\s*\d{2})/.test(entry.line))

  let previousDateIndex = -1
  for (const entry of dateIndexes) {
    let sectionStart = previousDateIndex + 1
    const specialIndex = lines.findLastIndex(
      (line, index) => index >= sectionStart && index < entry.index && /^特別企画$/.test(line),
    )
    if (specialIndex >= sectionStart) sectionStart = specialIndex + 1

    const section = lines.slice(sectionStart, entry.index)
    const title = section.map(validTitleCandidate).find(Boolean)
    if (title) {
      for (const parsed of entry.dates) {
        addEvent(events, source, {
          title,
          date: parsed.date,
          dateLine: entry.line,
          startsAt: parseStartTime(entry.line),
          session: sessionFor(title, entry.line),
          details: buildDetails(title, entry.line, section),
          chunk: section,
        })
      }
    }
    previousDateIndex = entry.index
  }
}

function parseDatedTitleLines(events, source, lines) {
  const { year, monthNumber } = datePartsFromMonth(source.month)
  for (const line of lines) {
    const dates = parseDateMentions(line, year, monthNumber)
    if (!dates.length) continue
    const title = validTitleCandidate(stripDateTokens(line))
    if (!title) continue
    for (const parsed of dates) {
      addEvent(events, source, {
        title,
        date: parsed.date,
        dateLine: line,
        startsAt: parseStartTime(line),
        session: sessionFor(title, line),
        details: buildDetails(title, line, [line], '公式イベント一覧に掲載。'),
      })
    }
  }
}

function parseScarlet(events, source, lines) {
  const { year, monthNumber } = datePartsFromMonth(source.month)
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!/^\d{2}\.\d{2}\s+[A-Z]{3}$/.test(lines[index])) continue
    const dates = parseDotDates(lines[index], year, monthNumber)
    const title = validTitleCandidate(lines[index + 1])
    if (!dates.length || !title) continue
    for (const parsed of dates) {
      addEvent(events, source, {
        title,
        date: parsed.date,
        startsAt: '19:00',
        session: 'night',
        details: '公式トップページの当日・次回イベント欄に掲載。',
      })
    }
  }
}

function eventTitleScore(value) {
  const title = validTitleCandidate(stripDateTokens(value))
  if (!title) return -100
  let score = title.length <= 40 ? 3 : 0
  if (/[A-Z]{2,}|NIGHT|DAY|祭|大会|コンテスト|パーティ|Party|朝恋|女子会|ランジェリー|ビギナー|倶楽部|フェス|BINGO|ビンゴ/i.test(title)) score += 8
  if (/開催|イベント/.test(title)) score += 3
  if (/^[【\[◆★]/.test(value)) score += 2
  if (/。$|ませんか|お待ち|プレゼント|無料|割引|入会金/.test(title)) score -= 5
  return score
}

function parseFilt(events, source, lines) {
  const { year, monthNumber } = datePartsFromMonth(source.month)
  const monthLabel = `${monthNumber}月`
  const monthStart = lines.findIndex((line) => line === monthLabel)
  const nextMonthStart = lines.findIndex((line, index) => index > monthStart && /^\d{1,2}月$/.test(line))
  const scoped = lines.slice(monthStart >= 0 ? monthStart : 0, nextMonthStart > monthStart ? nextMonthStart : lines.length)

  if (scoped.some((line) => new RegExp(`${monthNumber}月毎週金曜日`).test(line))) {
    addWeekly(events, source, [
      { weekday: 5, title: '女祭り', startsAt: '19:00', session: 'night', category: '女性特典', details: '公式ページに当月毎週金曜日開催として掲載。' },
    ])
  }
  if (scoped.some((line) => /毎週火曜日/.test(line) && /ビギナー|初めて/.test(scoped.join(' ')))) {
    addWeekly(events, source, [
      { weekday: 2, title: 'ビギナーズ倶楽部', startsAt: '19:00', session: 'night', category: '初心者', details: '公式ページに毎週火曜日開催として掲載。' },
    ])
  }

  const sectionStarts = scoped
    .map((line, index) => (/^20\d{2}\.\d{2}\.\d{2}$/.test(line) ? index : -1))
    .filter((index) => index >= 0)
  for (let sectionIndex = 0; sectionIndex < sectionStarts.length; sectionIndex += 1) {
    const start = sectionStarts[sectionIndex] + 1
    const end = sectionStarts[sectionIndex + 1] ?? scoped.length
    const section = scoped.slice(start, end)
    const dates = new Map()
    for (const line of section) {
      for (const parsed of parseDateMentions(line, year, monthNumber)) dates.set(parsed.date, parsed)
    }
    if (!dates.size) continue

    const titleLine = section
      .map((line) => ({ line, score: eventTitleScore(line) }))
      .toSorted((a, b) => b.score - a.score || section.indexOf(a.line) - section.indexOf(b.line))[0]
    const title = titleLine && titleLine.score >= 3 ? validTitleCandidate(stripDateTokens(titleLine.line)) : ''
    if (!title) continue
    const sectionText = section.join(' ')
    for (const parsed of dates.values()) {
      addEvent(events, source, {
        title,
        date: parsed.date,
        startsAt: parseStartTime(sectionText) || (/朝恋|ランジェリー|女子会/.test(title) ? '13:00' : '19:00'),
        session: sessionFor(title, sectionText),
        details: buildDetails(title, sectionText, section),
      })
    }
  }
}

function parseNumberedCalendar(events, source, lines, options = {}) {
  const { year, monthNumber } = datePartsFromMonth(source.month)
  const maxDay = new Date(year, monthNumber, 0).getDate()
  const start = options.startIndex ?? 0
  const end = options.endIndex ?? lines.length
  for (let index = start; index < end; index += 1) {
    const day = Number(lines[index])
    if (!Number.isInteger(day) || day < 1 || day > maxDay) continue
    const titles = []
    for (let i = index + 1; i < lines.length && i < index + 8; i += 1) {
      if (/^\d{1,2}$/.test(lines[i])) break
      if (/^(イベント一覧へ|自分のカレンダーと連携する|カレンダー以外にも|ブログリスト|過去のイベントを見る)$/.test(lines[i])) break
      if (/^\d+イベント/.test(lines[i])) continue
      if (/^\d{4}-\d{2}-\d{2}$/.test(lines[i])) continue
      const title = cleanTitle(lines[i])
      if (titleIsNoise(title) || isBadEventTitle(title)) continue
      if (/^(定休日|close|closed|休み)$/i.test(title)) continue
      if (titles.includes(title)) continue
      titles.push(title)
    }
    for (const title of titles.slice(0, options.maxPerDay ?? 4)) {
      const date = isoDate(year, monthNumber, day)
      const startsAt = parseStartTime(title) || (sessionFor(title, title) === 'day' ? '13:00' : '19:00')
      addEvent(events, source, {
        title: title.replace(/^(昼の部|夜の部)\s*/, ''),
        date,
        startsAt,
        session: sessionFor(title, title, startsAt),
        details: `公式カレンダーの日付欄に掲載。${detailTags([title], title).join(' / ') || '詳細は公式ページを確認'}`,
      })
    }
  }
}

function parseHarnesCalendar(events, source, lines) {
  const { year, monthNumber } = datePartsFromMonth(source.month)
  const monthStart = lines.findIndex((line) => line === `${monthNumber}月 ${year}`)
  if (monthStart < 0) return
  const campaignStart = lines.findIndex((line, index) => index > monthStart && line.includes('カレンダー以外にも'))
  const calendarStart = lines.findIndex((line, index) => index > monthStart && line === '1')
  const nextMonthStart = lines.findIndex((line, index) => index > calendarStart && line === '1')
  const calendarEnd = nextMonthStart > calendarStart ? nextMonthStart : campaignStart > 0 ? campaignStart : lines.length
  parseNumberedCalendar(events, source, lines, {
    startIndex: calendarStart > 0 ? calendarStart : monthStart,
    endIndex: calendarEnd,
    maxPerDay: 2,
  })
}

function parseColors(events, source, lines) {
  const { year, monthNumber } = datePartsFromMonth(source.month)
  const targetHeader = `${year}年${pad(monthNumber)}月01日`
  const headerIndex = lines.findIndex((line) => line === targetHeader)
  if (headerIndex >= 0) {
    for (let i = headerIndex + 1; i < Math.min(lines.length, headerIndex + 16); i += 1) {
      if (!/^[123]部 \[/.test(lines[i])) continue
      const title = cleanTitle(lines[i + 1] || '')
      addEvent(events, source, {
        date: isoDate(year, monthNumber, 1),
        title,
        startsAt: lines[i].startsWith('1部') ? '13:00' : '19:00',
        session: lines[i].startsWith('1部') ? 'day' : 'night',
        details: '公式イベントリストの当月1日欄から抽出。',
      })
    }
  }

  if (source.month !== '2026-06') return
  const weeklyIndex = lines.findIndex((line) => line === '週間イベント')
  const end = lines.findIndex((line, index) => index > weeklyIndex && line === '特別イベント月間カレンダー')
  if (weeklyIndex < 0 || end < 0) return
  for (let index = weeklyIndex + 1; index < end; index += 1) {
    const day = Number(lines[index])
    if (!Number.isInteger(day)) continue
    for (let i = index + 1; i < end && i < index + 10; i += 1) {
      if (/^\d{1,2}$/.test(lines[i])) break
      if (/^[123]部$/.test(lines[i])) {
        const title = cleanTitle(lines[i + 1] || '')
        addEvent(events, source, {
          date: isoDate(year, monthNumber, day),
          title,
          startsAt: lines[i] === '1部' ? '13:00' : '19:00',
          session: lines[i] === '1部' ? 'day' : 'night',
          details: '公式ページの週間イベント欄から抽出。',
        })
      }
    }
  }
}

function parseBDash(events, source, lines) {
  if (source.month === '2026-06') {
    const dateLine = lines.find((line) => /6\/20/.test(line))
    if (dateLine) {
      addEvent(events, source, {
        date: '2026-06-20',
        title: 'ぷるるん注意報',
        startsAt: '22:00',
        session: 'night',
        category: '公式イベント',
        details: '公式イベント詳細ページに6/20 22:00開始として掲載。BBS書込み特典表記あり。',
      })
    }
    return
  }
  if (source.month === '2026-07') {
    const start = lines.findIndex((line) => line === 'July 2026')
    const end = lines.findIndex((line, index) => index > start && line === 'イベント一覧へ')
    parseNumberedCalendar(events, source, lines, { startIndex: start, endIndex: end, maxPerDay: 3 })
  }
}

function addWeekly(events, source, rules) {
  const { year, monthNumber } = datePartsFromMonth(source.month)
  const maxDay = new Date(year, monthNumber, 0).getDate()
  for (let day = 1; day <= maxDay; day += 1) {
    const date = isoDate(year, monthNumber, day)
    const weekday = new Date(`${date}T00:00:00+09:00`).getDay()
    for (const rule of rules) {
      if (weekday !== rule.weekday) continue
      addEvent(events, source, {
        date,
        title: rule.title,
        startsAt: rule.startsAt,
        session: rule.session,
        category: rule.category,
        details: rule.details,
      })
    }
  }
}

function nthWeekday(year, monthNumber, weekday, nth) {
  let count = 0
  const maxDay = new Date(year, monthNumber, 0).getDate()
  for (let day = 1; day <= maxDay; day += 1) {
    const date = new Date(`${isoDate(year, monthNumber, day)}T00:00:00+09:00`)
    if (date.getDay() === weekday) {
      count += 1
      if (count === nth) return day
    }
  }
  return 0
}

function parseStoreSpecific(events, source, lines) {
  const { year, monthNumber } = datePartsFromMonth(source.month)

  if (source.storeId === 'papillon') {
    addWeekly(events, source, [
      {
        weekday: 4,
        title: 'レディースDAY',
        startsAt: '19:00',
        session: 'night',
        category: '女性特典',
        details: '公式イベントページの毎週木曜イベントとして掲載。',
      },
      {
        weekday: 4,
        title: '会員様割引DAY',
        startsAt: '19:00',
        session: 'night',
        category: '公式イベント',
        details: '公式イベントページの毎週木曜イベントとして掲載。',
      },
    ])
  }

  if (source.storeId === 'bar440') {
    const birthday = nthWeekday(year, monthNumber, 5, 3)
    const cooking = nthWeekday(year, monthNumber, 4, 4)
    if (birthday) {
      addEvent(events, source, {
        date: isoDate(year, monthNumber, birthday),
        title: 'バースデーイベント',
        startsAt: '19:00',
        session: 'night',
        category: '記念日',
        details: '公式ページに毎月第3金曜日のイベントとして掲載。',
      })
    }
    if (cooking) {
      addEvent(events, source, {
        date: isoDate(year, monthNumber, cooking),
        title: '料理イベント',
        startsAt: '19:00',
        session: 'night',
        category: '飲食',
        details: '公式ページに毎月第4木曜日のイベントとして掲載。',
      })
    }
  }

  if (source.storeId === 'filt-shibuya' && source.month === '2026-06') {
    addWeekly(events, source, [
      { weekday: 1, title: '早割りDAY', startsAt: '19:00', session: 'night', category: '公式イベント', details: '月曜夜の曜日イベント。21時までの来店割引表記あり。' },
      { weekday: 2, title: 'ビギナーズ倶楽部', startsAt: '13:00', session: 'day', category: '初心者', details: '火曜昼の曜日イベント。初回向け特典表記あり。' },
      { weekday: 2, title: 'ビールフリー', startsAt: '19:00', session: 'night', category: '飲食', details: '火曜夜の曜日イベント。ビール飲み放題表記あり。' },
      { weekday: 3, title: 'ご新規様半額キャンペーン', startsAt: '19:00', session: 'night', category: '初心者', details: '水曜夜の曜日イベント。初回来店向け割引表記あり。' },
      { weekday: 4, title: 'シャンパンLounge', startsAt: '19:00', session: 'night', category: '飲食', details: '木曜夜の曜日イベント。シャンパンフリー表記あり。' },
      { weekday: 5, title: '女祭り', startsAt: '19:00', session: 'night', category: '女性特典', details: '金曜夜の曜日イベント。BBS投稿特典表記あり。' },
      { weekday: 6, title: 'ビンゴ大会', startsAt: '19:00', session: 'night', category: '企画', details: '土曜夜の曜日イベント。ビンゴ企画として掲載。' },
      { weekday: 0, title: 'ピザ＆ワインラウンジ', startsAt: '13:00', session: 'day', category: '飲食', details: '日曜昼の曜日イベント。ピザとワインの表記あり。' },
      { weekday: 0, title: 'ご新規様入場料半額キャンペーン', startsAt: '19:00', session: 'night', category: '初心者', details: '日曜夜の曜日イベント。初回来店向け割引表記あり。' },
    ])
  }

  if (source.storeId === 'communicationbar-sango' && source.month === '2026-06') {
    addEvent(events, source, {
      date: '2026-06-21',
      title: 'スポーツバー珊瑚',
      startsAt: '13:00',
      session: 'day',
      category: '企画',
      details: '公式イベント一覧に「6/21(日)スポーツバー珊瑚」として掲載。',
    })
  }

  if (source.storeId === 'land-land') {
    const text = lines.join('\n')
    const title = '3周年祭'
    if (/3周年祭/.test(text) && source.month === '2026-07') {
      addEvent(events, source, {
        date: '2026-07-04',
        title,
        startsAt: '19:00',
        session: 'night',
        category: '記念日',
        details: '公式イベントカテゴリに7月4日19:00開始として掲載。来店予告割引表記あり。',
      })
    }
  }
}

function parseZeusCalendar(events, source, lines) {
  if (source.storeId !== 'club-zeus') return
  const { year, monthNumber } = datePartsFromMonth(source.month)
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\d+\s*件の予定、(\d{1,2})月\s*(\d{1,2})日/)
    if (!match || Number(match[1]) !== monthNumber) continue
    const title = cleanTitle(lines[index + 1] || '')
    if (!title || /通常営業|おやすみ|休業/.test(title)) continue
    const day = Number(match[2])
    addEvent(events, source, {
      date: isoDate(year, monthNumber, day),
      title,
      startsAt: '19:00',
      session: 'night',
      category: /緊縛|SM/i.test(title) ? '企画' : '公式イベント',
      details: '公式Googleカレンダーに日付付きで掲載。',
    })
  }
}

function parseSilentMoonArticles(events, source) {
  if (source.storeId !== 'secret-bar-silent-moon' || !Array.isArray(source.eventArticles)) return
  const [targetYear, targetMonth] = source.month.split('-').map(Number)
  const officialAuthors = /^(?:ATOM|Misa|silent\s*moon)$/i

  for (const article of source.eventArticles) {
    if (!officialAuthors.test(String(article.author).trim())) continue
    const postedAt = String(article.postedAt).normalize('NFKC')
    const dateMatch = postedAt.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\([^)]*\))?\s*(\d{1,2}):(\d{2})/)
    if (!dateMatch || Number(dateMatch[1]) !== targetYear || Number(dateMatch[2]) !== targetMonth) continue

    const date = isoDate(targetYear, targetMonth, Number(dateMatch[3]))
    const bodyLines = String(article.body)
      .normalize('NFKC')
      .split(/\n+/)
      .map((line) => cleanTitle(line))
      .filter(Boolean)
    const rawTitle = cleanTitle(article.title)
    let title = rawTitle
    if (/^[日月火水木金土]曜日$/.test(rawTitle)) {
      const descriptiveLine = bodyLines.find((line) => /(day|ナイト|お得|企画|イベント)/i.test(line))
      title = descriptiveLine?.replace(/[！!。].*$/, '').trim() || `${rawTitle}の公式企画`
    }
    if (!title) continue

    addEvent(events, source, {
      date,
      title,
      startsAt: parseStartTime(article.body) || '20:00',
      session: 'night',
      category: /女性/.test(`${title} ${article.body}`) ? '女性' : /新規|初めて/.test(`${title} ${article.body}`) ? '初心者' : '企画',
      details: bodyLines.slice(0, 5).join('。').slice(0, 180) || '公式BBSの日別店舗告知に掲載。',
    })
  }
}

function colorDistance(left, right) {
  return Math.sqrt(left.reduce((sum, channel, index) => sum + (channel - right[index]) ** 2, 0))
}

async function parseCollaboCalendarImage(source) {
  if (source.storeId !== 'collabo') return []
  const compactMonth = source.month.replace('-', '')
  const imageUrl = `https://crayoncal.e-shops.jp/cmscalimg/1103034/${compactMonth}.png`
  const response = await fetch(imageUrl, {
    headers: { 'user-agent': 'NightRadarCalendarBot/1.0' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`collabo calendar image HTTP ${response.status}`)
  const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width < 240 || info.height < 240 || info.channels < 3) {
    throw new Error(`collabo calendar image size ${info.width}x${info.height}`)
  }

  const palettes = {
    night: [23, 47, 75],
    day: [82, 208, 241],
    dayNight: [255, 102, 138],
    closed: [255, 221, 229],
  }
  const { year, monthNumber } = datePartsFromMonth(source.month)
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
  const maxDay = new Date(year, monthNumber, 0).getDate()
  const events = []

  for (let day = 1; day <= maxDay; day += 1) {
    const cellIndex = firstWeekday + day - 1
    const column = cellIndex % 7
    const row = Math.floor(cellIndex / 7)
    const x = 20 + column * 30
    const y = 90 + row * 30
    const pixelIndex = (y * info.width + x) * info.channels
    const color = [data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2]]
    const nearest = Object.entries(palettes)
      .map(([kind, palette]) => ({ kind, distance: colorDistance(color, palette) }))
      .toSorted((left, right) => left.distance - right.distance)[0]
    if (!nearest || nearest.distance > 24 || nearest.kind === 'closed') continue

    const date = isoDate(year, monthNumber, day)
    const sessions = nearest.kind === 'dayNight' ? ['day', 'night'] : [nearest.kind]
    for (const session of sessions) {
      addEvent(events, source, {
        date,
        title: session === 'day' ? '昼の部' : '夜の部',
        startsAt: session === 'day' ? '13:00' : '19:00',
        session,
        category: '営業予定',
        details: `公式月間スケジュール（${source.month}）の色分けから確認。`,
      })
    }
  }
  return events
}

function parseOneSource(source, text) {
  const lines = linesFromText(text)
  const events = []

  parseMarkerSections(events, source, lines)
  if (source.storeId === 'honey-trap') parseTitleContentDateSections(events, source, lines)
  if (source.storeId === 'arabesque') parseInlineJapaneseEvents(events, source, lines)
  if (source.storeId === 'bar-rusk') parseTrailingDateSections(events, source, lines)
  if (source.storeId === 'communicationbar-sango') parseDatedTitleLines(events, source, lines)
  if (source.storeId === 'voluptuous') parseDatedTitleLines(events, source, lines)
  if (source.storeId === 'club-scarlet-tokyo') parseScarlet(events, source, lines)
  if (source.storeId === 'filt-shibuya') parseFilt(events, source, lines)
  if (source.storeId === 'club-zeus') parseZeusCalendar(events, source, lines)
  if (source.storeId === 'secret-bar-silent-moon') parseSilentMoonArticles(events, source)

  if (source.storeId === 'harnes-tokyo') parseHarnesCalendar(events, source, lines)
  if (source.storeId === 'colors-bar') parseColors(events, source, lines)
  if (source.storeId === 'b-dash') parseBDash(events, source, lines)
  if (['agreeable', 'ogikubo-himitsu-club'].includes(source.storeId)) {
    parseNumberedCalendar(events, source, lines, { maxPerDay: source.storeId === 'ogikubo-himitsu-club' ? 3 : 4 })
  }

  parseStoreSpecific(events, source, lines)
  return events
}

function dedupe(events) {
  const byKey = new Map()
  for (const event of events) {
    const key = `${event.storeId}|${event.date}|${event.startsAt}|${event.title}`
    const current = byKey.get(key)
    if (!current || (event.details?.length ?? 0) > (current.details?.length ?? 0)) {
      byKey.set(key, event)
    }
  }
  const exact = [...byKey.values()]
  const fuzzy = []
  const identityTitle = (title) =>
    String(title)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/(?:スーパー)?レディースday|昼の部|夜の部|new|開催/g, '')
      .replace(/[^a-z0-9ぁ-んァ-ン一-龥]+/g, '')

  for (const event of exact) {
    const normalized = identityTitle(event.title)
    const duplicateIndex = fuzzy.findIndex((candidate) => {
      if (candidate.storeId !== event.storeId || candidate.date !== event.date || candidate.startsAt !== event.startsAt) return false
      const other = identityTitle(candidate.title)
      return normalized.length >= 4 && other.length >= 4 && (normalized.includes(other) || other.includes(normalized))
    })
    if (duplicateIndex < 0) {
      fuzzy.push(event)
      continue
    }
    const current = fuzzy[duplicateIndex]
    if (event.title.length + (event.details?.length ?? 0) > current.title.length + (current.details?.length ?? 0)) {
      fuzzy[duplicateIndex] = event
    }
  }

  return fuzzy
    .map((event) => ({ ...event, id: `${event.storeId}-${event.date}-${event.startsAt}-${slug(event.title)}` }))
    .toSorted((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt) || a.storeId.localeCompare(b.storeId))
}

function eventSemanticIssues(events) {
  const issues = []
  for (const event of events) {
    const explicitWeekdays = [...event.title.matchAll(/([日月火水木金土])曜日/g)].map((match) => `${match[1]}曜`)
    if (!explicitWeekdays.length || event.title.includes('祝日')) continue
    const actualWeekday = weekdayFor(event.date)
    if (!explicitWeekdays.includes(actualWeekday)) {
      issues.push({
        id: event.id,
        date: event.date,
        actualWeekday,
        title: event.title,
      })
    }
  }
  return issues
}

function sql(value) {
  if (value == null) return 'null'
  return `'${String(value).replaceAll("'", "''")}'`
}

function toSeedSql(events) {
  const rows = events
    .map(
      (event) =>
        `(${sql(event.id)}, ${sql(event.storeId)}, ${sql(event.date)}, ${sql(event.weekday)}, ${sql(event.startsAt)}, ${sql(event.session)}, ${sql(event.category)}, ${sql(event.title)}, ${sql(event.details || '')}, ${sql(event.sourceUrl)})`,
    )
    .join(',\n')

  return [
    '-- Generated by scripts/parse-event-scrape.mjs from public event pages and screenshots.',
    '-- Review source screenshots/text under output/event-scrape before production use.',
    "alter table public.events add column if not exists details text not null default '';",
    '',
    events.length
      ? [
          'insert into public.events (id, store_id, date_label, weekday, starts_at, session, category, title, details, source_url)',
          `values\n${rows}`,
          'on conflict (id) do update set',
          '  store_id = excluded.store_id,',
          '  date_label = excluded.date_label,',
          '  weekday = excluded.weekday,',
          '  starts_at = excluded.starts_at,',
          '  session = excluded.session,',
          '  category = excluded.category,',
          '  title = excluded.title,',
          '  details = excluded.details,',
          '  source_url = excluded.source_url;',
        ].join('\n')
      : '-- No events parsed.',
    '',
  ].join('\n')
}

function explicitNoEventReason(text, source) {
  if (source.storeId === 'mille-feuille' && /8月より開催予定/.test(String(text).normalize('NFKC'))) {
    return '公式ページに「8月より開催予定」と明記'
  }
  return ''
}

function mergeTargetMonths(existing, incoming, targetMonths) {
  const kept = existing.filter((event) => !targetMonths.has(String(event.date).slice(0, 7)))
  return dedupe([...kept, ...incoming])
}

async function main() {
  const scrapeRun = JSON.parse(await readFile(resultPath, 'utf8'))
  const parsed = []
  const notes = []
  const coverageByScope = new Map()

  for (const result of scrapeRun.results) {
    const scopeKey = `${result.storeId}|${result.month}`
    const coverage = coverageByScope.get(scopeKey) ?? {
      storeId: result.storeId,
      storeName: result.storeName,
      month: result.month,
      status: 'unverified',
      eventCount: 0,
      sourceUrls: [],
      checkedAt: scrapeRun.createdAt ?? new Date().toISOString(),
      note: '',
    }
    if (!coverage.sourceUrls.includes(result.url)) coverage.sourceUrls.push(result.url)
    coverageByScope.set(scopeKey, coverage)

    if (!result.ok || !result.textPath) {
      notes.push({ storeId: result.storeId, month: result.month, url: result.url, note: result.error || '取得失敗' })
      continue
    }
    if (result.status && result.status >= 400) {
      notes.push({ storeId: result.storeId, month: result.month, url: result.url, note: `HTTP ${result.status}` })
    }
    const text = await readFile(result.textPath, 'utf8')
    const source = {
      storeId: result.storeId,
      storeName: result.storeName,
      month: result.month,
      url: result.url,
      eventArticles: result.eventArticles ?? [],
    }
    const sourceEvents = parseOneSource(source, text)
    if (source.storeId === 'collabo') {
      try {
        sourceEvents.push(...(await parseCollaboCalendarImage(source)))
      } catch (error) {
        notes.push({
          storeId: source.storeId,
          month: source.month,
          url: result.url,
          note: error instanceof Error ? error.message : String(error),
        })
      }
    }
    parsed.push(...sourceEvents)
    if (sourceEvents.length) {
      coverage.status = 'scheduled'
      coverage.note = source.storeId === 'secret-bar-silent-moon' && /bbs2025/.test(source.url)
        ? '公式BBSの日別店舗告知から確認（今後分は告知後に追加）'
        : '公式ページから当月予定を抽出'
    } else {
      const noEventReason = explicitNoEventReason(text, source)
      if (noEventReason) {
        coverage.status = 'none'
        coverage.note = noEventReason
      }
    }
  }

  const events = dedupe(parsed)
  const semanticIssues = eventSemanticIssues(events)
  if (semanticIssues.length) {
    throw new Error(`Event weekday validation failed:\n${JSON.stringify(semanticIssues, null, 2)}`)
  }
  const byStore = events.reduce((map, event) => {
    map[event.storeId] = (map[event.storeId] ?? 0) + 1
    return map
  }, {})
  for (const coverage of coverageByScope.values()) {
    coverage.eventCount = events.filter(
      (event) => event.storeId === coverage.storeId && event.date.startsWith(`${coverage.month}-`),
    ).length
    if (coverage.eventCount > 0) coverage.status = 'scheduled'
    if (coverage.storeId === 'neo' && coverage.status === 'unverified') {
      coverage.note = '公式サイトは最新情報を公式Xで確認するよう案内。日付付きの当月予定は自動確認できず'
    }
  }
  const coverage = [...coverageByScope.values()].toSorted(
    (a, b) => a.storeId.localeCompare(b.storeId) || a.month.localeCompare(b.month),
  )

  const outputDir = path.dirname(resultPath)
  const parsedPath = path.join(outputDir, 'events.parsed.json')
  const reviewGeneratedPath = path.join(outputDir, 'official-events.generated.review.json')
  const reviewCoveragePath = path.join(outputDir, 'official-event-coverage.review.json')
  const generatedPath = path.join(process.cwd(), 'src', 'lib', 'official-events.generated.json')
  const generatedCoveragePath = path.join(process.cwd(), 'src', 'lib', 'official-event-coverage.generated.json')
  const targetMonths = new Set(scrapeRun.results.map((result) => result.month))
  const sqlPath = path.join(process.cwd(), 'supabase', `seed-events-${[...targetMonths].join('-')}.sql`)
  await mkdir(path.dirname(generatedPath), { recursive: true })
  await writeFile(parsedPath, JSON.stringify({ source: resultPath, events, coverage, notes, byStore }, null, 2))
  await writeFile(reviewGeneratedPath, `${JSON.stringify(events, null, 2)}\n`)
  await writeFile(reviewCoveragePath, `${JSON.stringify(coverage, null, 2)}\n`)

  if (writeCanonical) {
    const existingEvents = JSON.parse(await readFile(generatedPath, 'utf8').catch(() => '[]'))
    const existingCoverage = JSON.parse(await readFile(generatedCoveragePath, 'utf8').catch(() => '[]'))
    const mergedEvents = mergeTargetMonths(existingEvents, events, targetMonths)
    const mergedCoverage = [
      ...existingCoverage.filter((entry) => !targetMonths.has(entry.month)),
      ...coverage,
    ].toSorted((a, b) => a.month.localeCompare(b.month) || a.storeId.localeCompare(b.storeId))
    await writeFile(generatedPath, `${JSON.stringify(mergedEvents, null, 2)}\n`)
    await writeFile(generatedCoveragePath, `${JSON.stringify(mergedCoverage, null, 2)}\n`)
    await writeFile(sqlPath, toSeedSql(events))
  }

  console.log(
    JSON.stringify(
      {
        events: events.length,
        storesWithEvents: Object.keys(byStore).length,
        parsedPath,
        reviewGeneratedPath,
        reviewCoveragePath,
        generatedPath: writeCanonical ? generatedPath : null,
        generatedCoveragePath: writeCanonical ? generatedCoveragePath : null,
        sqlPath: writeCanonical ? sqlPath : null,
        notes: notes.length,
        byStore,
        coverage: coverage.reduce((map, entry) => {
          map[entry.status] = (map[entry.status] ?? 0) + 1
          return map
        }, {}),
      },
      null,
      2,
    ),
  )
}

await main()
