'use client'

import { useEffect, useState } from 'react'

export type CalendarEventView = {
  id: string
  date: string
  weekday: string
  startsAt: string
  session: 'day' | 'night'
  category: string
  title: string
  details?: string
  sourceUrl?: string
  storeLabel: string
}

export type CalendarDayView = {
  date: string
  day: number
  dateLabel: string
  events: CalendarEventView[]
}

export type CalendarMonthView = {
  key: string
  label: string
  eventCount: number
  cells: Array<CalendarDayView | null>
}

type CalendarDayExplorerProps = {
  months: CalendarMonthView[]
}

function sessionLabel(session: CalendarEventView['session']) {
  return session === 'day' ? '昼' : '夜'
}

function EventRows({ day, maxRows, variant }: { day: CalendarDayView; maxRows?: number; variant: 'popover' | 'drawer' }) {
  const visibleEvents = typeof maxRows === 'number' ? day.events.slice(0, maxRows) : day.events
  const hiddenCount = day.events.length - visibleEvents.length

  return (
    <div className="calendar-day-panel-events">
      {visibleEvents.map((event) => (
        <article className="calendar-day-panel-event" key={event.id}>
          <div>
            <strong>{event.storeLabel}</strong>
            <span>
              {event.startsAt || '時間未定'} / {sessionLabel(event.session)} / {event.category}
            </span>
          </div>
          <p>{event.title}</p>
          {event.details ? <small>{event.details}</small> : null}
          {event.sourceUrl ? (
            <a href={event.sourceUrl} target="_blank" rel="noreferrer" tabIndex={variant === 'popover' ? -1 : undefined}>
              公式ページ
            </a>
          ) : null}
        </article>
      ))}
      {hiddenCount > 0 ? <span className="calendar-hidden-count">ほか {hiddenCount}件</span> : null}
    </div>
  )
}

function DayPanel({ day, variant }: { day: CalendarDayView; variant: 'popover' | 'drawer' }) {
  return (
    <section
      aria-hidden={variant === 'popover' ? true : undefined}
      aria-label={`${day.dateLabel}のイベント詳細`}
      className={`calendar-day-panel is-${variant}`}
    >
      <header>
        <div>
          <span>日別詳細</span>
          <h3>{day.dateLabel}</h3>
        </div>
        <strong>{day.events.length}件</strong>
      </header>
      <EventRows day={day} maxRows={variant === 'popover' ? 6 : undefined} variant={variant} />
    </section>
  )
}

export function CalendarDayExplorer({ months }: CalendarDayExplorerProps) {
  const [selectedDay, setSelectedDay] = useState<CalendarDayView | null>(null)
  const [previewDay, setPreviewDay] = useState<CalendarDayView | null>(null)

  const openDrawerOnSmallScreen = (day: CalendarDayView) => {
    if (window.matchMedia('(max-width: 760px)').matches) setSelectedDay(day)
  }

  useEffect(() => {
    if (!selectedDay) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedDay(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedDay])

  return (
    <>
      <div className="calendar-months" aria-label="月間イベントカレンダー">
        {months.map((month) => (
          <section className="calendar-month" key={month.key}>
            <header>
              <div>
                <span>予定 {month.eventCount}件</span>
                <h2>{month.label}</h2>
              </div>
              <small>日付を選択</small>
            </header>
            <div className="calendar-weekdays" aria-hidden="true">
              {['月', '火', '水', '木', '金', '土', '日'].map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="calendar-month-grid">
              {month.cells.map((cell, index) =>
                cell ? (
                  <article
                    className={cell.events.length ? 'calendar-cell has-events' : 'calendar-cell'}
                    key={cell.date}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPreviewDay(null)
                    }}
                    onFocus={() => {
                      if (cell.events.length) setPreviewDay(cell)
                    }}
                    onMouseEnter={() => {
                      if (cell.events.length) setPreviewDay(cell)
                    }}
                    onMouseLeave={() => setPreviewDay(null)}
                  >
                    {cell.events.length ? (
                      <>
                        <button
                          aria-label={`${cell.dateLabel}のイベント${cell.events.length}件を表示`}
                          className="calendar-cell-button"
                          type="button"
                          onClick={() => openDrawerOnSmallScreen(cell)}
                        >
                          <span className="calendar-day-number">{cell.day}</span>
                          <span className="calendar-cell-count">{cell.events.length}件</span>
                          <span className="calendar-cell-events">
                            {cell.events.slice(0, 3).map((event) => (
                              <span className="calendar-event-pill" key={event.id}>
                                {event.storeLabel}
                              </span>
                            ))}
                            {cell.events.length > 3 ? <span className="calendar-more">+{cell.events.length - 3}</span> : null}
                          </span>
                        </button>
                        {previewDay?.date === cell.date ? <DayPanel day={cell} variant="popover" /> : null}
                      </>
                    ) : (
                      <div className="calendar-cell-empty">
                        <span className="calendar-day-number">{cell.day}</span>
                      </div>
                    )}
                  </article>
                ) : (
                  <div className="calendar-cell is-empty" key={`empty-${month.key}-${index}`} />
                ),
              )}
            </div>
          </section>
        ))}
      </div>

      {selectedDay ? (
        <div className="calendar-drawer-backdrop" role="presentation" onClick={() => setSelectedDay(null)}>
          <aside
            aria-label={`${selectedDay.dateLabel}のイベント詳細`}
            aria-modal="true"
            className="calendar-day-drawer"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="calendar-drawer-close" type="button" onClick={() => setSelectedDay(null)}>
              閉じる
            </button>
            <DayPanel day={selectedDay} variant="drawer" />
          </aside>
        </div>
      ) : null}
    </>
  )
}
