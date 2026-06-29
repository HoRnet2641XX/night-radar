import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { NightRadarAuthPage } from '@/components/night-radar-auth-page'
import { getCurrentUser } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ログイン | ナイトレーダー',
  description: 'ナイトレーダーにログインして、BBS検索、月間イベント、店舗別ランキングを確認します。',
}

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect('/')

  return <NightRadarAuthPage mode="login" />
}
