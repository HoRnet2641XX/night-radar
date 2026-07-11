import { redirect } from 'next/navigation'
import { NightRadarRedesign } from '@/components/night-radar-redesign'
import { getDashboardState } from '@/lib/server/repository'
import { getCurrentUser } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const params = await searchParams
  const user = await getCurrentUser()
  const isDevelopmentPreview = process.env.NODE_ENV === 'development' && params.preview === '1'
  if (!user && !isDevelopmentPreview) redirect('/login?next=/app')

  const state = await getDashboardState()

  return (
    <NightRadarRedesign
      calendarEvents={state.events}
      initialState={state}
    />
  )
}
