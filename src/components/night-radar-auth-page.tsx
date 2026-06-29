'use client'

import { useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Crosshair, EnvelopeSimple, GoogleLogo, XLogo } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import styles from './night-radar-auth-page.module.css'

type AuthMode = 'login' | 'signup'
type MessageTone = 'idle' | 'good' | 'warn' | 'error'

type AuthMessage = {
  tone: MessageTone
  text: string
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? '通信に失敗しました。')
  return json as T
}

function safeNextPath(value: string | null) {
  if (!value?.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  if (value.startsWith('/login') || value.startsWith('/signup')) return '/'
  return value
}

function Spinner() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.24" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3">
        <animateTransform attributeName="transform" dur="0.8s" from="0 12 12" repeatCount="indefinite" to="360 12 12" type="rotate" />
      </path>
    </svg>
  )
}

export function NightRadarAuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reduceMotion = useReducedMotion()
  const nextPath = useMemo(() => safeNextPath(searchParams.get('next')), [searchParams])
  const isSignup = mode === 'signup'
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<AuthMessage>({
    tone: 'idle',
    text: isSignup
      ? 'Google、X、メール認証のいずれかで会員登録できます。'
      : '登録済みの方法でログインしてください。',
  })

  async function startOAuth(provider: 'google' | 'x') {
    setBusy(provider)
    setMessage({ tone: 'idle', text: '認証画面へ移動します。' })
    try {
      window.localStorage.setItem(
        'night-radar-auth-intent',
        JSON.stringify({ provider, intent: mode, createdAt: Date.now() }),
      )
      const result = await postJson<{ url: string; mode?: string; message?: string }>('/api/auth/oauth', {
        provider,
        next: nextPath,
      })
      if (result.mode === 'demo') {
        setMessage({ tone: 'warn', text: result.message ?? '認証はデモモードです。' })
        return
      }
      if (result.url) window.location.assign(result.url)
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'ログインを開始できませんでした。' })
    } finally {
      setBusy('')
    }
  }

  async function sendEmailLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setMessage({ tone: 'warn', text: 'メールアドレスを入力してください。' })
      return
    }

    setBusy('email')
    setMessage({ tone: 'idle', text: '認証メールを送信しています。' })
    try {
      const result = await postJson<{ mode?: string; message?: string }>('/api/auth/email', {
        email: trimmedEmail,
        next: nextPath,
      })
      if (result.mode === 'demo') {
        setMessage({ tone: 'warn', text: result.message ?? '認証はデモモードです。' })
        return
      }
      router.push(`/auth/verify?intent=${mode}&email=${encodeURIComponent(trimmedEmail)}`)
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : '認証メールを送信できませんでした。' })
    } finally {
      setBusy('')
    }
  }

  const title = isSignup ? '会員登録' : 'ログイン'
  const lead = isSignup
    ? '登録後、BBS検索・注目ワード保存・店舗別ランキングを使えます。'
    : '認証後、今日の候補と月間イベントをそのまま確認できます。'
  const emailButton = isSignup ? 'メールで会員登録' : '認証メールでログイン'
  const switchHref = isSignup ? '/login' : '/signup'
  const switchText = isSignup ? 'すでにアカウントをお持ちの方' : 'アカウントをお持ちでない方'
  const switchLinkText = isSignup ? 'ログイン' : '会員登録'

  return (
    <main className={styles.authPage} id="main">
      <motion.div
        className={styles.authCard}
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className={styles.brand}>
          <Link className={styles.brandLogo} href="/">
            <span className={styles.brandMark}>
              <Crosshair size={24} weight="bold" />
            </span>
            ナイトレーダー
          </Link>
          <p>BBSとイベントから今日の候補を見る</p>
        </div>

        <section className={styles.panel} aria-label={title}>
          <div className={styles.heading}>
            <span>{isSignup ? 'はじめる' : '戻る'}</span>
            <h1>{title}</h1>
            <p>{lead}</p>
          </div>

          <div className={styles.oauthStack}>
            <button className={styles.oauthButton} type="button" onClick={() => startOAuth('google')} disabled={Boolean(busy)}>
              {busy === 'google' ? <Spinner /> : <GoogleLogo size={20} weight="bold" />}
              Googleで{isSignup ? '登録' : 'ログイン'}
            </button>
            <button className={styles.oauthButton} type="button" onClick={() => startOAuth('x')} disabled={Boolean(busy)}>
              {busy === 'x' ? <Spinner /> : <XLogo size={18} weight="bold" />}
              Xで{isSignup ? '登録' : 'ログイン'}
            </button>
          </div>

          <div className={styles.divider}>または</div>

          <form className={styles.emailForm} onSubmit={sendEmailLink} noValidate>
            <div className={styles.field}>
              <label htmlFor="auth-email">メールアドレス</label>
              <div className={styles.inputShell}>
                <EnvelopeSimple size={19} weight="bold" />
                <input
                  id="auth-email"
                  autoComplete="email"
                  inputMode="email"
                  name="email"
                  placeholder="your@email.com"
                  spellCheck={false}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>
            <button className={styles.submitButton} type="submit" disabled={busy === 'email'}>
              {busy === 'email' ? <Spinner /> : emailButton}
            </button>
          </form>

          <p className={`${styles.message} ${message.tone === 'idle' ? '' : styles[message.tone]}`} role={message.tone === 'error' ? 'alert' : undefined}>
            {message.text}
          </p>
        </section>

        <p className={styles.switchText}>
          {switchText} <Link href={switchHref}>{switchLinkText}</Link>
        </p>
        <Link className={styles.backLink} href="/">
          LPへ戻る
        </Link>
      </motion.div>
    </main>
  )
}
