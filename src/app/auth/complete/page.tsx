import type { Metadata } from 'next'
import { AuthCompleteRedirect } from '@/components/auth-complete-redirect'
import { safeNextPath } from '@/lib/auth-redirect'

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

  return <AuthCompleteRedirect nextPath={nextPath} />
}
