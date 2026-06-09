import { buildStoreRadarPoints, buildVisitForecasts } from '@/lib/scoring'
import { analyzeTextWithAi } from '@/lib/server/ai'
import { getDashboardState } from '@/lib/server/repository'

export const dynamic = 'force-dynamic'

export default async function AiGuidePage() {
  const state = await getDashboardState()
  const radar = buildStoreRadarPoints(state.stores, state.posts, state.bbsSnapshots)
  const forecasts = buildVisitForecasts(state.events, state.stores, state.posts)
  const topStore = radar[0]
  const topForecast = forecasts[0]
  const analysis = await analyzeTextWithAi(
    state.posts
      .slice(0, 8)
      .map((post) => post.body)
      .join('\n'),
  )

  return (
    <main className="insight-page">
      <section className="insight-sheet">
        <a className="back-link" href="/">
          Night Radarへ戻る
        </a>
        <header className="insight-header">
          <span>AIガイド</span>
          <h1>行く日を決める前の確認</h1>
          <p>公開情報から判断材料を整理します。個人追跡や来店保証ではなく、店舗単位の傾向確認として使います。</p>
        </header>
        <div className="guide-grid">
          <article>
            <span>今日の候補</span>
            <strong>{topForecast ? `${topForecast.store.name} / ${topForecast.score}` : 'データ不足'}</strong>
            <p>{topForecast?.reasons.join('、') ?? 'BBSとイベント情報を追加すると候補を出せます。'}</p>
          </article>
          <article>
            <span>Hot店舗</span>
            <strong>{topStore ? `${topStore.store.name} / ${topStore.score}` : '未観測'}</strong>
            <p>{topStore ? `${topStore.verdict}。注目シグナル ${topStore.signals.totalSignals}件。` : 'BBSソース巡回後に表示されます。'}</p>
          </article>
          <article>
            <span>マナー</span>
            <strong>安全確認を優先</strong>
            <p>{analysis.safetyNotes[0] ?? '店舗ルール、同意、距離感、清潔感、スタッフ指示を優先してください。公開情報だけを見る。'}</p>
          </article>
          <article>
            <span>AI要約</span>
            <strong>{analysis.eventCategory}</strong>
            <p>{analysis.summary}</p>
          </article>
        </div>
      </section>
    </main>
  )
}
