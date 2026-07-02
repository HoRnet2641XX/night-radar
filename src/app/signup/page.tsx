import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { NightRadarAuthPage } from '@/components/night-radar-auth-page'
import { getCurrentUser } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '会員登録 | ナイトレーダー',
  description: 'ナイトレーダーの会員登録。Xまたはメール認証でアプリを開始できます。',
}

export default async function SignupPage() {
  const user = await getCurrentUser()
  if (user) redirect('/')

  return <NightRadarAuthPage mode="signup" />
}
