import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { GuideArticleView, PublicShell } from '@/components/public-directory'
import { getPublicGuide, publicGuides } from '@/lib/public-guides'

type PageProps = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return publicGuides.map((guide) => ({ slug: guide.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const guide = getPublicGuide(slug)
  if (!guide) return { title: '使い方ガイド | Night Radar' }
  return {
    title: `${guide.title} | Night Radar`,
    description: guide.lead,
    alternates: { canonical: `/guides/${guide.slug}` },
  }
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params
  const guide = getPublicGuide(slug)
  if (!guide) notFound()

  return (
    <PublicShell current="guides">
      <GuideArticleView guide={guide} />
    </PublicShell>
  )
}
