'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { PublicStoreSummary } from '@/lib/public-directory'
import { usePublicFavoriteIds } from './public-favorite-button'
import styles from './public-directory.module.css'

function formatPublicStoreName(summary: PublicStoreSummary) {
  const raw = summary.store.name.trim()
  return raw ? `bar ${raw}` : '未登録店舗'
}

function storeDetailPath(summary: PublicStoreSummary) {
  return `/shops/${encodeURIComponent(summary.store.id)}`
}

export function PublicLikesClient({ summaries }: { summaries: PublicStoreSummary[] }) {
  const favoriteIds = usePublicFavoriteIds()
  const favoriteStores = useMemo(
    () => summaries.filter((summary) => favoriteIds.includes(summary.store.id)),
    [favoriteIds, summaries],
  )

  if (!favoriteStores.length) {
    return (
      <section className={styles.emptyState}>
        <p>保存した店舗はまだありません。</p>
        <h2>気になった店舗を保存すると、ここでまとめて見返せます。</h2>
        <Link href="/shops">店舗一覧へ</Link>
      </section>
    )
  }

  return (
    <section className={styles.storeGrid} aria-label="保存した店舗">
      {favoriteStores.map((summary) => (
        <article className={styles.compactStoreCard} key={summary.store.id}>
          <span>{summary.temperatureLabel}</span>
          <h2>{formatPublicStoreName(summary)}</h2>
          <p>{summary.primaryReason}</p>
          <dl>
            <div>
              <dt>更新</dt>
              <dd>{summary.lastUpdatedLabel}</dd>
            </div>
            <div>
              <dt>女性率</dt>
              <dd>{summary.womenRatio == null ? '観測中' : `${summary.womenRatio}%`}</dd>
            </div>
            <div>
              <dt>予定</dt>
              <dd>{summary.todayEventCount}件</dd>
            </div>
          </dl>
          <Link href={storeDetailPath(summary)}>詳細を見る</Link>
        </article>
      ))}
    </section>
  )
}
