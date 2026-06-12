import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Night Radar',
  description: '公開情報と投稿メモから、今日見るべき夜のシグナルをスマホで素早く判断するレーダーアプリ。',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'Night Radar',
    description: '公開情報と投稿メモから、今日見るべき夜のシグナルをスマホで素早く判断するレーダーアプリ。',
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
      </body>
    </html>
  )
}
