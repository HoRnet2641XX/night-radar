import type { Metadata, Viewport } from 'next'
import { PwaRegistration } from '@/components/pwa-registration'
import './globals.css'

const siteTitle = 'ナイトレーダー | 今日の行き先を投稿数で見極める'
const siteDescription =
  '公開BBSの女性書き込み数、直近3時間の投稿、店舗イベントを同じ条件で比較し、今日の行き先を判断できるアプリ。'
const socialCardVersion = '20260721'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://night-radar.vercel.app'),
  title: siteTitle,
  description: siteDescription,
  alternates: {
    canonical: '/app',
  },
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
    title: siteTitle,
    description: siteDescription,
    type: 'website',
    url: '/app',
    siteName: 'ナイトレーダー',
    locale: 'ja_JP',
    images: [
      {
        url: `/social/night-radar-og.jpg?v=${socialCardVersion}`,
        width: 1200,
        height: 630,
        alt: 'ナイトレーダー。今日の行き先を投稿数で見極めるアプリ画面。',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [`/social/night-radar-x.jpg?v=${socialCardVersion}`],
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
