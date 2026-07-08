import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Night Radar',
    short_name: 'N Radar',
    description: '今日の店舗候補を公開情報から見比べるレーダーアプリ。',
    start_url: '/app',
    display: 'standalone',
    background_color: '#07111f',
    theme_color: '#07111f',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
