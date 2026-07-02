import { redirect } from 'next/navigation'
import { NightRadarConsole } from '@/components/night-radar-console'
import officialEventsData from '@/lib/official-events.generated.json'
import { getDashboardState } from '@/lib/server/repository'
import { getCurrentUser } from '@/lib/supabase/server'
import type { EventInput } from '@/lib/types'

export const dynamic = 'force-dynamic'

const officialEvents = officialEventsData as EventInput[]

function mergeOfficialEvents(events: EventInput[]) {
  const merged = new Map(officialEvents.map((event) => [event.id, event]))
  for (const event of events) {
    const official = merged.get(event.id)
    merged.set(event.id, {
      ...official,
      ...event,
      details: event.details || official?.details,
      sourceUrl: event.sourceUrl || official?.sourceUrl,
    })
  }
  return [...merged.values()].filter((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.date))
}

export default async function AppPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/app')

  const state = await getDashboardState()

  return (
    <NightRadarConsole
      calendarEvents={mergeOfficialEvents(state.events)}
      initialState={state}
    />
  )
}
