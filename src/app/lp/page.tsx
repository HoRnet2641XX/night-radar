import type { Metadata } from 'next'
import { NightRadarLanding } from '@/components/night-radar-landing'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3010'),
  title: 'ナイトレーダー | BBSとイベントから今日の候補を見る',
  description:
    '公開BBS、店舗イベント、曜日傾向をまとめ、今日見るべき店舗候補をスマホで確認できるナイトレーダーの紹介ページ。',
  openGraph: {
    title: 'ナイトレーダー',
    description: 'BBSとイベントを読み、今日の判断材料を一画面にまとめる夜のレーダーアプリ。',
    type: 'website',
    images: ['/lp/app-preview-mobile.png'],
  },
}

export default function LandingPage() {
  return <NightRadarLanding />
}
