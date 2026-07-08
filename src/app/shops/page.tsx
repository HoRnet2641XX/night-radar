import type { Metadata } from 'next'
import {
  BreadcrumbJsonLd,
  DirectoryHero,
  PublicDecisionGuide,
  PublicDiscoveryRail,
  PublicHomeJsonLd,
  PublicShell,
  PublicStoreGrid,
  PublicSummaryStrip,
  StoreFilterLinks,
  StoreItemListJsonLd,
  StoreSearchForm,
  resolveAreaTitle,
  resolveConditionLabel,
} from '@/components/public-directory'
import { filterPublicStores, getPublicDirectoryState } from '@/lib/public-directory'

export const revalidate = 120

export const metadata: Metadata = {
  title: '店舗一覧 | Night Radar',
  description: '公開BBS、イベント、女性率、更新時刻から、今日比較したい店舗を探せます。',
  alternates: { canonical: '/shops' },
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function ShopsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const q = first(params.q)
  const area = first(params.area) ?? 'all'
  const condition = first(params.condition)
  const state = await getPublicDirectoryState()
  const summaries = filterPublicStores(state.summaries, { query: q, area, condition, ranking: 'today' })
  const title = resolveConditionLabel(condition) ? `${resolveAreaTitle(area)}、${resolveConditionLabel(condition)}` : resolveAreaTitle(area)

  return (
    <PublicShell current="shops">
      <PublicHomeJsonLd />
      <BreadcrumbJsonLd items={[{ name: '店舗一覧', href: '/shops' }]} />
      <StoreItemListJsonLd summaries={summaries} path="/shops" />
      {!q && area === 'all' && !condition ? <DirectoryHero state={state} /> : null}
      <PublicSummaryStrip state={state} />
      {!q && area === 'all' && !condition ? <PublicDiscoveryRail /> : null}
      <section className="sr-only" aria-label="現在の検索">
        <h1>{title}</h1>
      </section>
      <StoreSearchForm defaultQuery={q} area={area === 'all' ? undefined : area} condition={condition} />
      <StoreFilterLinks activeArea={area} activeCondition={condition} basePath="/shops" />
      <PublicStoreGrid summaries={summaries} variant="decision" />
      <PublicDecisionGuide />
    </PublicShell>
  )
}
