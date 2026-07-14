import type { Metadata } from 'next'
import { AreaIndexView, BreadcrumbJsonLd, PublicDataUnavailable, PublicShell } from '@/components/public-directory'
import { getPublicDirectoryState } from '@/lib/public-directory'

export const revalidate = 120

export const metadata: Metadata = {
  title: 'エリア検索 | Night Radar',
  description: '東京、渋谷、荻窪など、登録済み店舗をエリアから探せます。',
  alternates: { canonical: '/areas' },
}

export default async function AreasPage() {
  const state = await getPublicDirectoryState()
  return (
    <PublicShell current="areas">
      <BreadcrumbJsonLd items={[{ name: 'エリア検索', href: '/areas' }]} />
      {state.mode === 'unavailable' ? <PublicDataUnavailable message={state.connectionNote} /> : <AreaIndexView state={state} />}
    </PublicShell>
  )
}
