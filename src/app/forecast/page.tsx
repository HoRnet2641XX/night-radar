import { buildVisitForecasts } from '@/lib/scoring'
import { formatBarName } from '@/lib/display'
import { getDashboardState } from '@/lib/server/repository'

export const dynamic = 'force-dynamic'

export default async function ForecastPage() {
  const state = await getDashboardState()
  const forecasts = buildVisitForecasts(state.events, state.stores, state.posts)

  return (
    <main className="insight-page">
      <section className="insight-sheet">
        <a className="back-link" href="/">
          ナイトレーダーへ戻る
        </a>
        <header className="insight-header">
          <span>来店予告</span>
          <h1>来店予告ランキング</h1>
          <p>掲示板内の注目ワード、投稿鮮度、イベント相性から、検討しやすい順に並べます。</p>
        </header>
        <div className="forecast-page-list">
          {forecasts.map((forecast) => (
            <article key={forecast.id}>
              <div className="forecast-rank">{forecast.rank}</div>
              <div>
                <span>{forecast.dateLabel} / {forecast.timeLabel}</span>
                <h2>{formatBarName(forecast.store.name)}</h2>
                <p>{forecast.event?.title ?? '掲示板観測'}</p>
                <ul>
                  {forecast.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
              <strong>{forecast.score}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
