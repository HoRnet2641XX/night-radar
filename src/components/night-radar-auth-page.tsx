'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Crosshair, XLogo } from '@phosphor-icons/react'
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
  if (!value?.startsWith('/')) return '/app'
  if (value.startsWith('//')) return '/app'
  if (value.startsWith('/login') || value.startsWith('/signup')) return '/app'
  return value
}

function authErrorText(value: string | null) {
  const messages: Record<string, string> = {
    oauth_cancelled: '外部認証がキャンセルされました。もう一度ログイン方法を選んでください。',
    oauth_failed: '外部認証を完了できませんでした。時間を置いてもう一度お試しください。',
    missing_code: '認証コードを受け取れませんでした。もう一度ログインしてください。',
    auth_config_missing: '認証設定を確認してください。Supabaseの接続設定が不足しています。',
    session_exchange_failed: '認証セッションを確定できませんでした。もう一度ログインしてください。',
    session_missing: '認証後のセッションを確認できませんでした。もう一度ログインしてください。',
  }

  return value ? messages[value] ?? 'ログインを完了できませんでした。もう一度お試しください。' : null
}

export function NightRadarAuthPage({ mode }: { mode: AuthMode }) {
  const searchParams = useSearchParams()
  const reduceMotion = useReducedMotion()
  const nextPath = useMemo(() => safeNextPath(searchParams.get('next')), [searchParams])
  const initialError = useMemo(() => authErrorText(searchParams.get('error')), [searchParams])
  const isSignup = mode === 'signup'
  const [oauthPending, setOauthPending] = useState<'x' | ''>('')
  const [message, setMessage] = useState<AuthMessage>({
    tone: initialError ? 'error' : 'idle',
    text:
      initialError ??
      (isSignup
        ? 'Xアカウントで会員登録できます。'
        : 'Xアカウントでログインしてください。'),
  })

  async function startOAuth(provider: 'x') {
    setOauthPending(provider)
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
      setOauthPending('')
    }
  }

  const title = isSignup ? '会員登録' : 'ログイン'
  const lead = isSignup
    ? 'X認証後、BBS検索・注目ワード保存・店舗別ランキングを使えます。'
    : 'X認証後、今日の候補と月間イベントをそのまま確認できます。'
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
            <span>{isSignup ? 'はじめる' : 'アプリへ入る'}</span>
            <h1>{title}</h1>
            <p>{lead}</p>
          </div>

          <div className={styles.oauthStack}>
            <button className={styles.oauthButton} type="button" onClick={() => startOAuth('x')} disabled={Boolean(oauthPending)}>
              <XLogo size={18} weight="bold" />
              {oauthPending === 'x' ? '認証画面を開いています' : `Xで${isSignup ? '登録' : 'ログイン'}`}
            </button>
          </div>

          <p className={`${styles.message} ${message.tone === 'idle' ? '' : styles[message.tone]}`} role={message.tone === 'error' ? 'alert' : undefined}>
            {message.text}
          </p>
        </section>

        <p className={styles.switchText}>
          {switchText} <Link href={switchHref}>{switchLinkText}</Link>
        </p>
        <Link className={styles.backLink} href="/">
          紹介ページへ戻る
        </Link>
      </motion.div>
    </main>
  )
}
