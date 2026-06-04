export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <section>
        <p>Privacy</p>
        <h1>プライバシーポリシー</h1>
        <div>
          <h2>取得する情報</h2>
          <p>認証情報、登録店舗、BBSソースURL、投稿メモ、検索ワード、通知履歴、決済状態をサービス提供のために保存します。</p>
          <h2>利用目的</h2>
          <p>店舗別分析、完全一致検索、通知配信、課金管理、セキュリティ監査、障害調査に利用します。</p>
          <h2>保存と削除</h2>
          <p>ユーザーが登録したデータは、本人の依頼または運用上必要な範囲で削除できます。個人追跡を目的としたデータ保持は行いません。</p>
          <h2>外部サービス</h2>
          <p>認証にSupabase、決済にStripe、メール配信にResend、AI分析にOpenAIを利用する場合があります。</p>
        </div>
      </section>
    </main>
  )
}
