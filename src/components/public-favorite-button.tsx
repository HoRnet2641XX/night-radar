'use client'

import { useMemo, useSyncExternalStore } from 'react'
import styles from './public-directory.module.css'

const favoritesKey = 'night-radar-public-favorites'

function readFavorites() {
  if (typeof window === 'undefined') return new Set<string>()
  try {
    const parsed = JSON.parse(window.localStorage.getItem(favoritesKey) ?? '[]') as string[]
    return new Set(parsed)
  } catch {
    return new Set<string>()
  }
}

function writeFavorites(favorites: Set<string>) {
  window.localStorage.setItem(favoritesKey, JSON.stringify([...favorites]))
  window.dispatchEvent(new CustomEvent('night-radar:favorites-change', { detail: [...favorites] }))
}

function subscribeFavorites(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', callback)
  window.addEventListener('night-radar:favorites-change', callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener('night-radar:favorites-change', callback)
  }
}

function favoriteSnapshot() {
  if (typeof window === 'undefined') return '[]'
  return JSON.stringify([...readFavorites()])
}

export function PublicFavoriteButton({ storeId }: { storeId: string }) {
  const favoriteIds = usePublicFavoriteIds()
  const isFavorite = favoriteIds.includes(storeId)

  function toggleFavorite() {
    const favorites = readFavorites()
    if (favorites.has(storeId)) {
      favorites.delete(storeId)
    } else {
      favorites.add(storeId)
    }
    writeFavorites(favorites)
  }

  return (
    <button
      aria-pressed={isFavorite}
      className={styles.favoriteButton}
      type="button"
      onClick={toggleFavorite}
    >
      {isFavorite ? '保存済み' : '保存'}
    </button>
  )
}

export function usePublicFavoriteIds() {
  const snapshot = useSyncExternalStore(subscribeFavorites, favoriteSnapshot, () => '[]')
  return useMemo(() => {
    try {
      return JSON.parse(snapshot) as string[]
    } catch {
      return []
    }
  }, [snapshot])
}
