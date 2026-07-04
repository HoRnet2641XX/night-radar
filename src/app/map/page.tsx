import type { Metadata } from 'next'
import { BreadcrumbJsonLd, MapExplorerView, PublicShell } from '@/components/public-directory'
import { getPublicDirectoryState, sortByRanking } from '@/lib/public-directory'

export const revalidate = 120

export const metadata: Metadata = {
  title: '地図で探す | Night Radar',
  description: '店舗一覧と地図風UIを切り替えながら、移動しやすい候補を確認できます。',
  alternates: { canonical: '/map' },
}

export default async function MapPage() {
  const state = await getPublicDirectoryState()
  return (
    <PublicShell current="map">
      <BreadcrumbJsonLd items={[{ name: '地図', href: '/map' }]} />
      <MapExplorerView summaries={sortByRanking(state.summaries, 'today')} />
    </PublicShell>
  )
}
