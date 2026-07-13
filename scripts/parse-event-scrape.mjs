import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const resultPath = process.argv[2]
if (!resultPath) {
  throw new Error('Usage: node scripts/parse-event-scrape.mjs <output/event-scrape/.../results.json>')
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
  if (/次回のコメント|誹謗中傷|当掲示板|問い合わせ|20歳未満|保存する/.test(title)) return true
  if (/^(単独|カップル|男性様|女性様|ご新規|BBS|前日|当日|さらに|フリータイム|入場料|通常有料)/.test(title)) return true
  if (/。|ませんか|ください|頂戴|いただ|させて|ご案内|お待ち|期待させ|サポート/.test(title)) return true
  if (/飲み放題！.*毎日開催/.test(title)) return true
  if (title.length > 74 && /。|！|♪|ます|です/.test(title)) return true
  return false
}

function findTitleBefore(lines, index) {
  for (let i = index - 1; i >= 0 && i >= index - 16; i -= 1) {
    const line = cleanTitle(lines[i])
    if (/^～/.test(line)) break
    if (/^\d{1,2}[\/月]/.test(line)) continue
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

function findTitleForMarker(lines, markerIndex) {
  for (let index = markerIndex - 1; index >= 0 && index >= markerIndex - 80; index -= 1) {
    if (/～(?:実施日|開催日)～/.test(lines[index])) break
    if (/～(?:イベント内容|キャンペーン内容)～/.test(lines[index])) {
      return findTitleBefore(lines, index)
    }
  }
  return findTitleBefore(lines, markerIndex)
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

function parseJapaneseDateList(value, defaultYear, defaultMonth) {
  const dates = []
  let month = defaultMonth
  const normalized = String(value).normalize('NFKC')
  const regex = /(?:(\d{1,2})\s*月)?\s*(\d{1,2})\s*日/g
  for (const match of normalized.matchAll(regex)) {
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

function datePartsFromMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  return { year, monthNumber }
}

function addEvent(events, source, partial) {
  const title = cleanTitle(partial.title)
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
    const titleBefore = findTitleForMarker(lines, index)
    const dateLines = []
    const chunk = []
    if (/(\d{1,2}\s*[\/／]\s*\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*日)/.test(markerLine)) {
      dateLines.push({ line: markerLine, index })
    }
    for (let i = index + 1; i < lines.length; i += 1) {
      if (i > index + 44) break
      if (i > index + 1 && /～(開催日|実施日)～/.test(lines[i])) break
      if (i > index + 3 && !/^\d{1,2}[\/月]/.test(lines[i]) && /^(HOME|Event|イベント|The special event)$/i.test(lines[i])) break
      chunk.push(lines[i])
      if (/(\d{1,2}\s*[\/／]\s*\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*日)/.test(lines[i])) {
        dateLines.push({ line: lines[i], index: i })
      }
    }
    for (const dateLine of dateLines) {
      const line = dateLine.line
      const title = titleBefore
      const dates = [...parseSlashDates(line, year, monthNumber), ...parseJapaneseDateList(line, year, monthNumber)]
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
    for (let i = index + 1; i < lines.length && i < index + 34; i += 1) {
      if (i > index + 2 && /～(イベント内容|キャンペーン内容)～/.test(lines[i])) break
      chunk.push(lines[i])
    }

    const dateLines = chunk.filter((line) => /(\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}\s*[\/／]\s*\d{1,2})/.test(line))
    for (const line of dateLines.slice(0, 3)) {
      const dates = [...parseJapaneseDateList(line, year, monthNumber), ...parseSlashDates(line, year, monthNumber)]
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
    if (!/(\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}\s*[\/／]\s*\d{1,2})/.test(line)) continue
    if (!/[：:]/.test(line) && !/(月|火|水|木|金|土|日)曜日/.test(line)) continue
    const dates = [...parseJapaneseDateList(line, year, monthNumber), ...parseSlashDates(line, year, monthNumber)]
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
  const monthStart = lines.findIndex((line) => line === '6月 2026')
  if (monthStart < 0) return
  const campaignStart = lines.findIndex((line, index) => index > monthStart && line.includes('カレンダー以外にも'))
  if (source.month === '2026-06') {
    const end = lines.findIndex((line, index) => index > monthStart && line === '1' && lines[index + 1] === 'M’ｓ festival')
    parseNumberedCalendar(events, source, lines, { startIndex: monthStart, endIndex: end > 0 ? end : campaignStart, maxPerDay: 2 })
    return
  }
  if (source.month === '2026-07') {
    const julyStart = lines.findIndex((line, index) => index > monthStart && line === '1' && lines[index + 1] === 'M’ｓ festival')
    parseNumberedCalendar(events, source, lines, { startIndex: julyStart > 0 ? julyStart : monthStart, endIndex: campaignStart, maxPerDay: 2 })
  }
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

  if (source.storeId === 'collabo' && source.month === '2026-06') {
    const dayNight = [
      [20, '昼の部＆夜の部', '昼夜両枠の色分け日'],
    ]
    const dayOnly = [6, 13, 27].map((day) => [day, '昼の部', '昼の部の色分け日'])
    const nightOnly = [5, 11, 19, 25, 29].map((day) => [day, '夜の部', '夜の部の色分け日'])
    for (const [day, title, detail] of [...dayOnly, ...nightOnly, ...dayNight]) {
      const date = isoDate(year, monthNumber, day)
      addEvent(events, source, {
        date,
        title,
        startsAt: title.includes('昼') ? '13:00' : '19:00',
        session: title.includes('昼') ? 'day' : 'night',
        category: title.includes('昼') ? '昼イベント' : '公式イベント',
        details: `スクリーンショットの月間スケジュール色分けから抽出。${detail}。`,
      })
    }
  }

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

  if (source.storeId === 'bar440' && source.month === '2026-06') {
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

function parseOneSource(source, text) {
  const lines = linesFromText(text)
  const events = []

  parseMarkerSections(events, source, lines)
  if (source.storeId === 'honey-trap') parseTitleContentDateSections(events, source, lines)
  if (source.storeId === 'arabesque') parseInlineJapaneseEvents(events, source, lines)

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
  return [...byKey.values()]
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

async function main() {
  const scrapeRun = JSON.parse(await readFile(resultPath, 'utf8'))
  const parsed = []
  const notes = []

  for (const result of scrapeRun.results) {
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
    }
    parsed.push(...parseOneSource(source, text))
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

  const outputDir = path.dirname(resultPath)
  const parsedPath = path.join(outputDir, 'events.parsed.json')
  const generatedPath = path.join(process.cwd(), 'src', 'lib', 'official-events.generated.json')
  const sqlPath = path.join(process.cwd(), 'supabase', 'seed-events-2026-06-07.sql')
  await mkdir(path.dirname(generatedPath), { recursive: true })
  await writeFile(parsedPath, JSON.stringify({ source: resultPath, events, notes, byStore }, null, 2))
  await writeFile(generatedPath, `${JSON.stringify(events, null, 2)}\n`)
  await writeFile(sqlPath, toSeedSql(events))

  console.log(
    JSON.stringify(
      {
        events: events.length,
        storesWithEvents: Object.keys(byStore).length,
        parsedPath,
        generatedPath,
        sqlPath,
        notes: notes.length,
        byStore,
      },
      null,
      2,
    ),
  )
}

await main()
