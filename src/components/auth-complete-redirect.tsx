'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function AuthCompleteRedirect({ nextPath }: { nextPath: string }) {
  const router = useRouter()

  useEffect(() => {
    router.prefetch(nextPath)
    const timer = window.setTimeout(() => {
      router.replace(nextPath)
    }, 700)

    return () => window.clearTimeout(timer)
  }, [nextPath, router])

  return (
    <main aria-busy="true" className="route-loading-screen" id="main">
      <div className="route-loader" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>アプリへ移動しています</p>
      <small>認証が完了しました。画面を準備しています</small>
    </main>
  )
}
