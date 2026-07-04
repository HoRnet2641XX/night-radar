import type { Metadata } from 'next'
import { BreadcrumbJsonLd, FeatureIndexView, PublicShell } from '@/components/public-directory'

export const metadata: Metadata = {
  title: '条件検索 | Night Radar',
  description: '営業中、イベントあり、女性率高め、昼営業、夜営業などの条件から店舗を探せます。',
  alternates: { canonical: '/features' },
}

export default function FeaturesPage() {
  return (
    <PublicShell current="features">
      <BreadcrumbJsonLd items={[{ name: '条件検索', href: '/features' }]} />
      <FeatureIndexView />
    </PublicShell>
  )
}
