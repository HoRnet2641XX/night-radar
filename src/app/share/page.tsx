import type { Metadata } from 'next'
import { ShareForwarder } from './share-forwarder'

const title = 'ナイトレーダー | 今日の行き先を投稿数で見極める'
const description = '公開BBSの投稿、直近の動き、店舗イベントから、今日の候補と比較で見つけた穴場を確認できます。'
const cardVersion = '20260721'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/app' },
  robots: { index: false, follow: true },
  openGraph: {
    title,
    description,
    type: 'website',
    url: '/share',
    siteName: 'ナイトレーダー',
    locale: 'ja_JP',
    images: [
      {
        url: `/social/night-radar-og.jpg?v=${cardVersion}`,
        width: 1200,
        height: 630,
        alt: 'ナイトレーダー。今日の行き先を投稿数で見極めるアプリ画面。',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [`/social/night-radar-x.jpg?v=${cardVersion}`],
  },
}

export default function SharePage() {
  return (
    <main
      id="main"
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: '#070b13',
        color: '#f4f6fa',
        fontFamily: '"Noto Sans JP", "Hiragino Sans", sans-serif',
        textAlign: 'center',
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>ナイトレーダーを開いています</p>
        <a
          href="/app"
          style={{ display: 'inline-block', marginTop: '16px', color: '#ff7468', fontSize: '14px' }}
        >
          自動で開かない場合はこちら
        </a>
      </div>
      <ShareForwarder />
    </main>
  )
}
