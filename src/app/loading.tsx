export default function Loading() {
  return (
    <main aria-busy="true" className="route-loading-screen" id="main">
      <div className="route-loader" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>読み込み中</p>
      <small>公開情報を整理しています</small>
    </main>
  )
}
