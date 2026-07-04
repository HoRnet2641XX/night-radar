import type { Metadata } from 'next'
import { BreadcrumbJsonLd, PublicShell } from '@/components/public-directory'
import { PublicLikesClient } from '@/components/public-likes-client'
import { getPublicDirectoryState } from '@/lib/public-directory'

export const revalidate = 120

export const metadata: Metadata = {
  title: '保存した店舗 | Night Radar',
  description: '公開店舗一覧で保存した店舗をまとめて見返せます。',
  alternates: { canonical: '/likes' },
}

export default async function LikesPage() {
  const state = await getPublicDirectoryState()
  return (
    <PublicShell current="likes">
      <BreadcrumbJsonLd items={[{ name: '保存した店舗', href: '/likes' }]} />
      <section className="sr-only">
        <h1>保存した店舗</h1>
      </section>
      <PublicLikesClient summaries={state.summaries} />
    </PublicShell>
  )
}
