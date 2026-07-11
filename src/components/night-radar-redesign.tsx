'use client'

import { useMemo } from 'react'
import { adaptDashboardToBars } from '@/app/components/data/adapter'
import { NightRadarDataProvider } from '@/app/components/data/runtime'
import App from '@/app/components/App'
import type { DashboardState, EventInput } from '@/lib/types'
import '@/styles/index.css'

type NightRadarRedesignProps = {
  initialState: DashboardState
  calendarEvents: EventInput[]
}

export function NightRadarRedesign({ initialState, calendarEvents }: NightRadarRedesignProps) {
  const data = useMemo(() => adaptDashboardToBars(initialState, calendarEvents), [initialState, calendarEvents])

  return (
    <NightRadarDataProvider value={data}>
      <App />
    </NightRadarDataProvider>
  )
}
