import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicDataUnavailable, PublicShell, StoreDetailView } from '@/components/public-directory'
import { formatPublicStoreName, getPublicDirectoryState, getPublicStoreDetail, storeDetailPath } from '@/lib/public-directory'

export const revalidate = 120

type PageProps = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const state = await getPublicDirectoryState()
  const summary = state.summaries.find((item) => item.store.id === id)
  if (!summary) return { title: '店舗が見つかりません | Night Radar' }

  return {
    title: `${formatPublicStoreName(summary.store)} | Night Radar`,
    description: `${summary.areaLabel}の${formatPublicStoreName(summary.store)}。営業時間、料金、BBS、地図、今日の根拠を確認できます。`,
    alternates: { canonical: storeDetailPath(summary.store) },
  }
}

export default async function StorePage({ params }: PageProps) {
  const { id } = await params
  const state = await getPublicDirectoryState()
  if (state.mode === 'unavailable') {
    return <PublicShell current="shops"><PublicDataUnavailable message={state.connectionNote} /></PublicShell>
  }
  const detail = await getPublicStoreDetail(id)
  if (!detail) notFound()

  return (
    <PublicShell current="shops">
      <StoreDetailView detail={detail} />
    </PublicShell>
  )
}
