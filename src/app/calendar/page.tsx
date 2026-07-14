import { formatBarName } from '@/lib/display'
import { eventWeekday } from '@/lib/date'
import { mergeOfficialEvents } from '@/lib/official-events'
import { getDashboardState } from '@/lib/server/repository'
import type { EventInput, StoreProfile } from '@/lib/types'
import { CalendarDayExplorer, type CalendarEventView, type CalendarMonthView } from '@/components/calendar-day-explorer'
import { DataUnavailable } from '@/components/data-unavailable'

export const dynamic = 'force-dynamic'

const officialStoreNames: Record<string, string> = {
  collabo: 'collabo',
  'honey-trap': 'HONEY TRAP',
  'bar-rusk': 'BAR RUSK',
  papillon: 'Papillon',
  'harnes-tokyo': 'HARNES TOKYO',
  'bar-face': 'BAR FACE',
  'campo-bar': 'CAMPO BAR',
  arabesque: 'ARABESQUE',
  'colors-bar': 'COLORS BAR',
  bar440: 'BAR440',
  voluptuous: 'Voluptuous',
  'retreat-bar': 'RETREAT BAR',
  agreeable: 'AgreeAble',
  'secret-bar-silent-moon': 'Secret Bar Silent Moon',
  'bar-spear': 'BAR SPEAR',
  'bar-canelo': 'BAR CANELO',
  'b-dash': 'B-DASH',
  'ogikubo-himitsu-club': '荻窪秘密倶楽部',
  'club-zeus': 'CLUB ZEUS',
  'land-land': 'land land',
  'filt-shibuya': 'FILT SHIBUYA',
  'communicationbar-sango': 'Communicationbar 珊瑚',
}

const monthFormatter = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' })
const dayFormatter = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })

function eventTimeValue(event: EventInput) {
  return event.startsAt || (event.session === 'day' ? '13:00' : '19:00')
}

function sortEvents(events: EventInput[]) {
  return events.toSorted(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      eventTimeValue(a).localeCompare(eventTimeValue(b)) ||
      a.storeId.localeCompare(b.storeId) ||
      a.title.localeCompare(b.title),
  )
}

function mergeEvents(databaseEvents: EventInput[]) {
  return sortEvents(mergeOfficialEvents(databaseEvents))
}

function storeNameFor(storeMap: Map<string, StoreProfile>, storeId: string) {
  return storeMap.get(storeId)?.name ?? officialStoreNames[storeId] ?? storeId
}

function toCalendarEvent(event: EventInput, storeMap: Map<string, StoreProfile>): CalendarEventView {
  return {
    id: event.id,
    date: event.date,
    weekday: eventWeekday(event),
    startsAt: event.startsAt,
    session: event.session,
    category: event.category,
    title: event.title,
    details: event.details,
    sourceUrl: event.sourceUrl,
    storeLabel: formatBarName(storeNameFor(storeMap, event.storeId)),
  }
}

function buildMonths(events: EventInput[], storeMap: Map<string, StoreProfile>) {
  const monthKeys = [...new Set(events.map((event) => event.date.slice(0, 7)))].sort()
  return monthKeys.map<CalendarMonthView>((key) => {
    const [year, month] = key.split('-').map(Number)
    const monthEvents = events.filter((event) => event.date.startsWith(key))
    const eventsByDate = monthEvents.reduce<Map<string, EventInput[]>>((map, event) => {
      map.set(event.date, [...(map.get(event.date) ?? []), event])
      return map
    }, new Map())

    const firstDate = new Date(`${key}-01T00:00:00+09:00`)
    const lastDay = new Date(year, month, 0).getDate()
    const mondayBasedOffset = (firstDate.getDay() + 6) % 7
    const cells: CalendarMonthView['cells'] = Array.from({ length: mondayBasedOffset }, () => null)

    for (let day = 1; day <= lastDay; day += 1) {
      const date = `${key}-${String(day).padStart(2, '0')}`
      cells.push({
        date,
        day,
        dateLabel: dayFormatter.format(new Date(`${date}T00:00:00+09:00`)),
        events: sortEvents(eventsByDate.get(date) ?? []).map((event) => toCalendarEvent(event, storeMap)),
      })
    }

    return {
      key,
      label: monthFormatter.format(firstDate),
      cells,
      eventCount: monthEvents.length,
    }
  })
}

export default async function CalendarPage() {
  const state = await getDashboardState()
  if (state.mode === 'unavailable') return <DataUnavailable message={state.connectionNote} />
  const storeMap = new Map(state.stores.map((store) => [store.id, store]))
  const events = mergeEvents(state.events)
  const months = buildMonths(events, storeMap)
  const sourceCount = new Set(events.map((event) => event.sourceUrl).filter(Boolean)).size

  return (
    <main className="calendar-route" id="main">
      <section className="calendar-app-shell">
        <div className="calendar-page-backdrop" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <a className="calendar-back-link" href="/app">
          ナイトレーダーへ戻る
        </a>

        <header className="calendar-hero">
          <div>
            <span>月間イベント</span>
            <h1>イベントカレンダー</h1>
            <p>日付を選ぶと、その日の店舗別イベントを確認できます。PCは日付にカーソル、スマホはタップで詳細を開きます。</p>
          </div>
          <aside aria-label="掲載状況">
            <strong>{events.length}</strong>
            <span>掲載イベント</span>
          </aside>
        </header>

        <div className="calendar-summary-row" aria-label="取得状況">
          <article>
            <span>対象月</span>
            <strong>{months.length}</strong>
          </article>
          <article>
            <span>対象店舗</span>
            <strong>{new Set(events.map((event) => event.storeId)).size}</strong>
          </article>
          <article>
            <span>公式URL</span>
            <strong>{sourceCount}</strong>
          </article>
        </div>

        <div className="calendar-source-note">
          タイトルと詳細は公式ページ本文から短く整形しています。一部店舗は公式ページの取得状況により未掲載です。
        </div>

        <CalendarDayExplorer months={months} />
      </section>
    </main>
  )
}
