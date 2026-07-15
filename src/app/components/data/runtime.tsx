'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { NightRadarViewData } from './adapter'
import { EMPTY_WEEKLY_MOMENTUM, RUNTIME_META, tickerFromBars } from './mock'

const fallbackData: NightRadarViewData = {
  bars: [],
  events: [],
  posts: [],
  weeklyMomentum: EMPTY_WEEKLY_MOMENTUM,
  meta: RUNTIME_META,
}

const NightRadarDataContext = createContext<NightRadarViewData>(fallbackData)

export function NightRadarDataProvider({ value, children }: { value: NightRadarViewData; children: ReactNode }) {
  return <NightRadarDataContext.Provider value={value}>{children}</NightRadarDataContext.Provider>
}

export function useNightRadarData() {
  return useContext(NightRadarDataContext)
}

export function useNightRadarTicker() {
  const { bars } = useNightRadarData()
  return useMemo(() => tickerFromBars(bars), [bars])
}
