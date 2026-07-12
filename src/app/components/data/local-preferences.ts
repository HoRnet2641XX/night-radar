'use client'

import { useCallback, useEffect, useState } from 'react'

type LocalPreferences = {
  savedWords: string[]
  candidateStoreIds: string[]
}

const storageKey = 'night-radar:local-preferences:v1'
const changeEvent = 'night-radar:local-preferences-changed'
const emptyPreferences: LocalPreferences = { savedWords: [], candidateStoreIds: [] }

function normalizeWord(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function readPreferences(): LocalPreferences {
  if (typeof window === 'undefined') return emptyPreferences
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')
    return {
      savedWords: Array.isArray(parsed.savedWords)
        ? parsed.savedWords.map(String).map(normalizeWord).filter(Boolean).slice(0, 20)
        : [],
      candidateStoreIds: Array.isArray(parsed.candidateStoreIds)
        ? parsed.candidateStoreIds.map(String).filter(Boolean).slice(0, 50)
        : [],
    }
  } catch {
    return emptyPreferences
  }
}

function writePreferences(preferences: LocalPreferences) {
  window.localStorage.setItem(storageKey, JSON.stringify(preferences))
  window.dispatchEvent(new Event(changeEvent))
}

export function useLocalPreferences() {
  const [preferences, setPreferences] = useState<LocalPreferences>(emptyPreferences)

  useEffect(() => {
    const sync = () => setPreferences(readPreferences())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener(changeEvent, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(changeEvent, sync)
    }
  }, [])

  const update = useCallback((transform: (current: LocalPreferences) => LocalPreferences) => {
    const next = transform(readPreferences())
    writePreferences(next)
    setPreferences(next)
  }, [])

  const toggleWord = useCallback((value: string) => {
    const word = normalizeWord(value)
    if (!word) return
    update((current) => {
      const exists = current.savedWords.some((item) => normalizeWord(item) === word)
      return {
        ...current,
        savedWords: exists
          ? current.savedWords.filter((item) => normalizeWord(item) !== word)
          : [word, ...current.savedWords].slice(0, 20),
      }
    })
  }, [update])

  const toggleCandidateStore = useCallback((storeId: string) => {
    if (!storeId) return
    update((current) => ({
      ...current,
      candidateStoreIds: current.candidateStoreIds.includes(storeId)
        ? current.candidateStoreIds.filter((id) => id !== storeId)
        : [storeId, ...current.candidateStoreIds].slice(0, 50),
    }))
  }, [update])

  const clearPreferences = useCallback(() => update(() => emptyPreferences), [update])

  return {
    ...preferences,
    toggleWord,
    toggleCandidateStore,
    clearPreferences,
  }
}
