import Link from 'next/link'
import { Crosshair } from '@phosphor-icons/react/dist/ssr'
import styles from '@/components/night-radar-auth-page.module.css'

export default function NotFound() {
  return (
    <main className={styles.authPage} id="main">
      <section className={styles.authCard} aria-label="ページが見つかりません">
        <div className={styles.brand}>
          <Link className={styles.brandLogo} href="/">
            <span className={styles.brandMark}>
              <Crosshair size={24} weight="bold" />
            </span>
            ナイトレーダー
          </Link>
          <p>BBSとイベントから今日の候補を見る</p>
        </div>

        <div className={styles.panel}>
          <div className={styles.heading}>
            <span>ページ未検出</span>
            <h1>このページは見つかりません。</h1>
            <p>URLが変わったか、現在は公開されていないページです。トップまたはログイン画面から入り直してください。</p>
          </div>

          <Link className={styles.submitButton} href="/">
            トップへ戻る
          </Link>
          <Link className={styles.ghostLink} href="/login">
            ログインへ
          </Link>
        </div>
      </section>
    </main>
  )
}
