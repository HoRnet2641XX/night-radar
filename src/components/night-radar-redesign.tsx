'use client'

import { NightRadarDataProvider } from '@/app/components/data/runtime'
import { AppAgeGate } from '@/app/components/AppAgeGate'
import type { NightRadarViewData } from '@/app/components/data/adapter'
import App from '@/app/components/App'
import type { RuntimeMode } from '@/lib/types'
import '@/styles/index.css'

type NightRadarRedesignProps = {
  connectionNote?: string
  initialData: NightRadarViewData
  mode: RuntimeMode
}

export function NightRadarRedesign({ connectionNote, initialData, mode }: NightRadarRedesignProps) {
  if (mode === 'unavailable') {
    return (
      <AppAgeGate>
        <main className="nr-data-unavailable" aria-labelledby="data-unavailable-title">
          <div>
            <p>データ更新停止</p>
            <h1 id="data-unavailable-title">最新情報を読み込めませんでした</h1>
            <span>{connectionNote ?? '時間をおいて再読み込みしてください。'}</span>
            <button type="button" onClick={() => window.location.reload()}>
              再読み込み
            </button>
          </div>
        </main>
      </AppAgeGate>
    )
  }

  return (
    <AppAgeGate>
      <NightRadarDataProvider value={initialData}>
        <App />
      </NightRadarDataProvider>
    </AppAgeGate>
  )
}
