import { NightRadarRedesign } from '@/components/night-radar-redesign'
import { adaptPublicDirectoryToBars } from '@/app/components/data/adapter'
import { getPublicDirectoryState } from '@/lib/public-directory'

export const dynamic = 'force-dynamic'

export default async function AppPage() {
  const state = await getPublicDirectoryState()
  const data = adaptPublicDirectoryToBars(state)
  const initialData = {
    ...data,
    events: data.events.filter((event) => event.date === data.meta.todayKey),
    posts: [],
  }

  return (
    <NightRadarRedesign
      connectionNote={state.connectionNote}
      initialData={initialData}
      mode={state.mode}
    />
  )
}
