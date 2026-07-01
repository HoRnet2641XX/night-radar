import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthCompleteRedirect } from '@/components/auth-complete-redirect'
import { safeNextPath } from '@/lib/auth-redirect'
import { getCurrentUser } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'アプリへ移動中 | ナイトレーダー',
  description: '認証完了後、ナイトレーダーのアプリ画面へ移動しています。',
}

export default async function AuthCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const nextPath = safeNextPath(params.next)
  const user = await getCurrentUser()

  if (!user) {
    const loginPath = new URLSearchParams({ error: 'session_missing' })
    if (nextPath !== '/') loginPath.set('next', nextPath)
    redirect(`/login?${loginPath.toString()}`)
  }

  return <AuthCompleteRedirect nextPath={nextPath} />
}
