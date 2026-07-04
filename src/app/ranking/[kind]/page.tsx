import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BreadcrumbJsonLd, PublicShell, RankingView, StoreItemListJsonLd } from '@/components/public-directory'
import { getPublicDirectoryState, publicRankingKinds, sortByRanking, type RankingKind } from '@/lib/public-directory'

export const revalidate = 120

type PageProps = {
  params: Promise<{ kind: string }>
}

function isRankingKind(value: string): value is RankingKind {
  return publicRankingKinds.some((kind) => kind.key === value)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind } = await params
  const active = publicRankingKinds.find((item) => item.key === kind)
  if (!active) return { title: 'ランキング | Night Radar' }

  return {
    title: `${active.label}ランキング | Night Radar`,
    description: active.description,
    alternates: { canonical: `/ranking/${kind}` },
  }
}

export default async function RankingPage({ params }: PageProps) {
  const { kind } = await params
  if (!isRankingKind(kind)) notFound()

  const state = await getPublicDirectoryState()
  const ranked = sortByRanking(state.summaries, kind)

  return (
    <PublicShell current="ranking">
      <BreadcrumbJsonLd
        items={[
          { name: 'ランキング', href: '/ranking/today' },
          { name: publicRankingKinds.find((item) => item.key === kind)?.label ?? '今日', href: `/ranking/${kind}` },
        ]}
      />
      <StoreItemListJsonLd summaries={ranked} path={`/ranking/${kind}`} />
      <RankingView kind={kind} state={state} />
    </PublicShell>
  )
}
