import type { MetadataRoute } from 'next'
import { getPublicDirectoryState, storeDetailPath } from '@/lib/public-directory'
import { publicGuides } from '@/lib/public-guides'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://night-radar.vercel.app'

export const revalidate = 300

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const state = await getPublicDirectoryState()
  const staticPaths = [
    '/',
    '/lp',
    '/shops',
    '/ranking/today',
    '/ranking/weekend',
    '/ranking/female',
    '/ranking/events',
    '/ranking/open',
    '/areas',
    '/features',
    '/map',
    '/guides',
    '/likes',
    '/terms',
    '/privacy',
  ]

  return [
    ...staticPaths.map((path) => ({
      url: `${baseUrl}${path}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: path === '/shops' ? 0.95 : 0.7,
    })),
    ...state.summaries.map((summary) => ({
      url: `${baseUrl}${storeDetailPath(summary.store)}`,
      lastModified: summary.lastUpdatedAt ? new Date(summary.lastUpdatedAt) : new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.82,
    })),
    ...publicGuides.map((guide) => ({
      url: `${baseUrl}/guides/${guide.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.66,
    })),
  ]
}
