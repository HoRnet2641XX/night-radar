import { NightRadarRedesign } from '@/components/night-radar-redesign'
import { getDashboardState } from '@/lib/server/repository'

export const dynamic = 'force-dynamic'

export default async function AppPage() {
  const state = await getDashboardState()

  return (
    <NightRadarRedesign
      calendarEvents={state.events}
      initialState={state}
    />
  )
}
