type DataUnavailableProps = {
  message?: string
  backHref?: string
}

export function DataUnavailable({
  message = '最新情報を読み込めませんでした。時間をおいて再読み込みしてください。',
  backHref = '/app',
}: DataUnavailableProps) {
  return (
    <main className="insight-page">
      <section className="insight-sheet">
        <a className="back-link" href={backHref}>ナイトレーダーへ戻る</a>
        <header className="insight-header">
          <span>データ更新停止</span>
          <h1>最新情報を確認できません</h1>
          <p>{message}</p>
        </header>
        <a className="back-link" href="">再読み込み</a>
      </section>
    </main>
  )
}
