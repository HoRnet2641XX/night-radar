import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  BreadcrumbJsonLd,
  PublicShell,
  PublicStoreGrid,
  StoreFilterLinks,
  StoreItemListJsonLd,
} from '@/components/public-directory'
import { filterPublicStores, getAreaLabelFromSlug, getPublicDirectoryState } from '@/lib/public-directory'

export const revalidate = 120

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const label = getAreaLabelFromSlug(slug)
  if (!label) return { title: 'エリア | Night Radar' }
  return {
    title: `${label}の店舗 | Night Radar`,
    description: `${label}エリアの店舗を、更新、女性率、イベント、営業時間で比較できます。`,
    alternates: { canonical: `/areas/${slug}` },
  }
}

export default async function AreaPage({ params }: PageProps) {
  const { slug } = await params
  const label = getAreaLabelFromSlug(slug)
  if (!label) notFound()

  const state = await getPublicDirectoryState()
  const summaries = filterPublicStores(state.summaries, { area: slug, ranking: 'today' })

  return (
    <PublicShell current="areas">
      <BreadcrumbJsonLd
        items={[
          { name: 'エリア検索', href: '/areas' },
          { name: label, href: `/areas/${slug}` },
        ]}
      />
      <StoreItemListJsonLd summaries={summaries} path={`/areas/${slug}`} />
      <section className="sr-only">
        <h1>{label}の店舗</h1>
      </section>
      <StoreFilterLinks activeArea={slug} basePath="/shops" />
      <PublicStoreGrid summaries={summaries} />
    </PublicShell>
  )
}
