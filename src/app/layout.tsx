import type { Metadata, Viewport } from 'next'
import { PwaRegistration } from '@/components/pwa-registration'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3010'),
  title: 'ナイトレーダー',
  description: '公開BBSの女性書き込み数、直近3時間の投稿、店舗イベントを同じ条件で比較できるアプリ。',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    title: 'ナイトレーダー',
    description: '公開BBSの女性書き込み数、直近3時間の投稿、店舗イベントを同じ条件で比較できるアプリ。',
    type: 'website',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#07111f',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <a className="skip-link" href="#main">
          メインへ移動
        </a>
        {children}
        <PwaRegistration />
      </body>
    </html>
  )
}
