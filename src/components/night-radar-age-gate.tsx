'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './night-radar-landing.module.css'

const storageKey = 'night-radar-age-confirmed'
const storageValue = 'v1'

export function NightRadarAgeGate() {
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [isDenied, setIsDenied] = useState(false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (window.localStorage.getItem(storageKey) === storageValue) {
      window.queueMicrotask(() => setIsConfirmed(true))
    }
  }, [])

  useEffect(() => {
    if (isConfirmed) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    confirmButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isConfirmed])

  if (isConfirmed) return null

  function confirmAge() {
    window.localStorage.setItem(storageKey, storageValue)
    setIsConfirmed(true)
  }

  function leavePage() {
    setIsDenied(true)
  }

  function goBack() {
    if (window.history.length > 1) {
      window.history.back()
      return
    }
    window.location.assign('https://www.google.com/')
  }

  return (
    <div className={styles.ageGate} role="presentation">
      <section
        aria-labelledby="age-gate-title"
        aria-describedby="age-gate-description"
        aria-modal="true"
        className={styles.ageDialog}
        role="dialog"
      >
        <p className={styles.ageKicker}>年齢確認</p>
        <h2 id="age-gate-title">18歳以上ですか？</h2>
        <p id="age-gate-description">
          ナイトレーダーは成人向け店舗に関連する公開情報を扱うため、18歳未満の方はご利用いただけません。
        </p>

        {isDenied ? (
          <div className={styles.ageDenied} role="status">
            <p>このサイトは18歳以上の方のみご利用いただけます。</p>
            <button className={styles.ageSecondaryButton} type="button" onClick={goBack}>
              前のページへ戻る
            </button>
          </div>
        ) : (
          <div className={styles.ageActions}>
            <button ref={confirmButtonRef} className={styles.agePrimaryButton} type="button" onClick={confirmAge}>
              18歳以上です
            </button>
            <button className={styles.ageSecondaryButton} type="button" onClick={leavePage}>
              18歳未満です
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
