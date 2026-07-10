import { redirect } from 'next/navigation'
import { NightRadarRedesign } from '@/components/night-radar-redesign'
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
      calendarEvents={mergeOfficialEvents(state.events)}
      initialState={state}
    />
  )
}
