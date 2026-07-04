import type { Metadata } from 'next'
import { BreadcrumbJsonLd, GuideIndexView, PublicShell } from '@/components/public-directory'
import { publicGuides } from '@/lib/public-guides'

export const metadata: Metadata = {
  title: '使い方ガイド | Night Radar',
  description: '初めての確認、料金、ルール、今夜の探し方を短く整理したNight Radarのガイドです。',
  alternates: { canonical: '/guides' },
}

export default function GuidesPage() {
  return (
    <PublicShell current="guides">
      <BreadcrumbJsonLd items={[{ name: '使い方', href: '/guides' }]} />
      <GuideIndexView guides={publicGuides} />
    </PublicShell>
  )
}
