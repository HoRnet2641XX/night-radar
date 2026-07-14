import { decisionDateKeyInJapan } from '@/lib/scoring'
import { formatBarName } from '@/lib/display'
import { getPublicDirectoryState, sortByRanking } from '@/lib/public-directory'
import { DataUnavailable } from '@/components/data-unavailable'

export const dynamic = 'force-dynamic'

export default async function AiGuidePage() {
  const state = await getPublicDirectoryState()
  if (state.mode === 'unavailable') return <DataUnavailable message={state.connectionNote} />
  const ranked = sortByRanking(state.summaries, 'today')
  const topStore = ranked[0]
  const activity = topStore?.insight.activity
  const todayKey = decisionDateKeyInJapan(state.generatedAt)
  const todayEvents = todayKey
    ? state.events.filter((event) => event.date === todayKey && event.storeId === topStore?.store.id)
    : []
  const primaryEvent = todayEvents[0]

  return (
    <main className="insight-page">
      <section className="insight-sheet">
        <a className="back-link" href="/app">
          ナイトレーダーへ戻る
        </a>
        <header className="insight-header">
          <span>公開情報の確認ガイド</span>
          <h1>行く日を決める前の確認</h1>
          <p>当営業日の顧客投稿、投稿者数、直近更新、公式予定を店舗単位で確認します。来店人数を保証する情報ではありません。</p>
        </header>
        <div className="guide-grid">
          <article>
            <span>当日投稿が最も多い店舗</span>
            <strong>{topStore ? formatBarName(topStore.store.name) : 'データ不足'}</strong>
            <p>{activity ? `顧客投稿 ${activity.recentPostCount}件 / 投稿者 ${activity.uniqueAuthorCount}名 / 直近3時間 ${activity.recentThreeHourCount}件` : '当営業日の投稿を確認できていません。'}</p>
          </article>
          <article>
            <span>本日の公式予定</span>
            <strong>{primaryEvent?.title ?? '予定を確認中'}</strong>
            <p>{primaryEvent ? `${primaryEvent.startsAt}開始 / 同店の本日予定 ${todayEvents.length}件` : '公式ページで本日の予定を確認できていません。'}</p>
          </article>
          <article>
            <span>データの状態</span>
            <strong>{topStore?.dataConfidenceLabel ?? '確認中'}</strong>
            <p>{topStore ? `${topStore.insight.freshnessLabel} / ${topStore.reliabilityLabel} / 時刻不明で除外 ${topStore.excludedUntimestampedCount}件` : '巡回状態を取得できていません。'}</p>
          </article>
          <article>
            <span>行く前に確認</span>
            <strong>公式情報を最後に確認</strong>
            <p>料金、営業時間、入店条件、同意、店舗ルールは変更される場合があります。公式ページとスタッフ案内を優先してください。</p>
          </article>
        </div>
      </section>
    </main>
  )
}
