import type { Metadata } from 'next'
import Link from 'next/link'
import { Crosshair, EnvelopeSimple } from '@phosphor-icons/react/dist/ssr'
import styles from '@/components/night-radar-auth-page.module.css'

export const metadata: Metadata = {
  title: 'メールを確認 | ナイトレーダー',
  description: 'ナイトレーダーの認証メールを確認する画面です。',
}

export default async function AuthVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; intent?: string }>
}) {
  const params = await searchParams
  const intent = params.intent === 'signup' ? '会員登録' : 'ログイン'
  const email = params.email

  return (
    <main className={styles.authPage} id="main">
      <div className={styles.authCard}>
        <div className={styles.brand}>
          <Link className={styles.brandLogo} href="/">
            <span className={styles.brandMark}>
              <Crosshair size={24} weight="bold" />
            </span>
            ナイトレーダー
          </Link>
          <p>BBSとイベントから今日の候補を見る</p>
        </div>

        <section className={styles.panel} aria-label="メールを確認してください">
          <div className={styles.heading}>
            <span>{intent}</span>
            <h1>メールを確認してください。</h1>
            <p>
              {email ? `${email} 宛てに` : ''}
              認証リンクを送りました。メール内のリンクを開くと、アプリ画面に戻ります。
            </p>
          </div>

          <p className={`${styles.message} ${styles.good}`}>
            リンクの有効期限が切れた場合は、もう一度ログインまたは会員登録から認証メールを送ってください。
          </p>

          <div className={styles.verifyActions}>
            <Link className={styles.submitButton} href="/login">
              <EnvelopeSimple size={18} weight="bold" />
              ログインページへ
            </Link>
            <Link className={styles.ghostLink} href="/signup">
              会員登録ページへ
            </Link>
          </div>
        </section>

        <Link className={styles.backLink} href="/">
          LPへ戻る
        </Link>
      </div>
    </main>
  )
}
