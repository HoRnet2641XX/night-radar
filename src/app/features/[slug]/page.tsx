import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  BreadcrumbJsonLd,
  PublicShell,
  PublicStoreGrid,
  StoreFilterLinks,
  StoreItemListJsonLd,
  resolveConditionLabel,
} from '@/components/public-directory'
import { filterPublicStores, getPublicDirectoryState, publicConditions } from '@/lib/public-directory'

export const revalidate = 120

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const label = resolveConditionLabel(slug)
  if (!label) return { title: '条件検索 | Night Radar' }
  return {
    title: `${label}の店舗 | Night Radar`,
    description: `${label}に当てはまる店舗を、今日のスコアと行く前確認で比較できます。`,
    alternates: { canonical: `/features/${slug}` },
  }
}

export default async function FeaturePage({ params }: PageProps) {
  const { slug } = await params
  if (!publicConditions.some((condition) => condition.key === slug)) notFound()
  const label = resolveConditionLabel(slug) ?? '条件検索'
  const state = await getPublicDirectoryState()
  const summaries = filterPublicStores(state.summaries, { condition: slug, ranking: 'today' })

  return (
    <PublicShell current="features">
      <BreadcrumbJsonLd
        items={[
          { name: '条件検索', href: '/features' },
          { name: label, href: `/features/${slug}` },
        ]}
      />
      <StoreItemListJsonLd summaries={summaries} path={`/features/${slug}`} />
      <section className="sr-only">
        <h1>{label}の店舗</h1>
      </section>
      <StoreFilterLinks activeCondition={slug} basePath="/shops" />
      <PublicStoreGrid summaries={summaries} />
    </PublicShell>
  )
}
