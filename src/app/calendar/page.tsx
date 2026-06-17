import { formatBarName } from '@/lib/display'
import { getDashboardState } from '@/lib/server/repository'

export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const state = await getDashboardState()
  const storeMap = new Map(state.stores.map((store) => [store.id, store]))
  const grouped = state.events.reduce<Map<string, typeof state.events>>((map, event) => {
    const date = event.date || '日付未設定'
    map.set(date, [...(map.get(date) ?? []), event])
    return map
  }, new Map())

  return (
    <main className="insight-page">
      <section className="insight-sheet">
        <a className="back-link" href="/">
          ナイトレーダーへ戻る
        </a>
        <header className="insight-header">
          <span>月間予定</span>
          <h1>月間イベント</h1>
          <p>登録済み店舗と取り込み済みイベントを日付ごとに集約します。</p>
        </header>
        <div className="calendar-list">
          {[...grouped.entries()].map(([date, events]) => (
            <section key={date}>
              <h2>{date}</h2>
              <div>
                {events.map((event) => (
                  <article key={event.id}>
                    <span>{event.weekday} {event.startsAt}</span>
                    <strong>{formatBarName(storeMap.get(event.storeId)?.name)}</strong>
                    <p>{event.title} / {event.category}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
