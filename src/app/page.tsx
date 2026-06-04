import { NightRadarConsole } from '@/components/night-radar-console'
import { getDashboardState } from '@/lib/server/repository'

export default async function Page() {
  const state = await getDashboardState()

  return (
    <NightRadarConsole
      initialState={state}
    />
  )
}
