'use client'

import { useMemo } from 'react'
import { adaptDashboardToBars } from '@/app/components/data/adapter'
import { setNightRadarRuntimeData } from '@/app/components/data/mock'
import App from '@/app/components/App'
import type { DashboardState, EventInput } from '@/lib/types'
import '@/styles/index.css'

type NightRadarRedesignProps = {
  initialState: DashboardState
  calendarEvents: EventInput[]
}

export function NightRadarRedesign({ initialState, calendarEvents }: NightRadarRedesignProps) {
  const data = useMemo(() => adaptDashboardToBars(initialState, calendarEvents), [initialState, calendarEvents])
  setNightRadarRuntimeData(data.bars, data.events, data.meta)

  return <App />
}
