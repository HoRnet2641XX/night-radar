import type { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://night-radar.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: 'Twitterbot',
        allow: ['/app', '/share', '/social/'],
        disallow: ['/api/', '/auth/'],
      },
      {
        userAgent: '*',
        allow: ['/', '/share', '/social/'],
        disallow: ['/api/', '/app', '/auth/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
