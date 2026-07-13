'use client'

import { useCallback, useEffect, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>
}

const dismissedStorageKey = 'night-radar-install-reminder-dismissed-at'
const defaultReminderIntervalMs = 1000 * 60 * 60 * 24 * 7

export function usePwaInstall(reminderIntervalMs = defaultReminderIntervalMs) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [showReminder, setShowReminder] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) return

    const dismissedAt = Number(window.localStorage.getItem(dismissedStorageKey) ?? 0)
    const reminderTimer =
      !dismissedAt || Date.now() - dismissedAt > reminderIntervalMs
        ? window.setTimeout(() => setShowReminder(true), 0)
        : undefined

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
      setShowReminder(true)
    }
    const handleInstalled = () => {
      window.localStorage.setItem(dismissedStorageKey, String(Date.now()))
      setInstallPrompt(null)
      setShowGuide(false)
      setShowReminder(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      if (reminderTimer) window.clearTimeout(reminderTimer)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [reminderIntervalMs])

  const dismiss = useCallback(() => {
    window.localStorage.setItem(dismissedStorageKey, String(Date.now()))
    setShowGuide(false)
    setShowReminder(false)
  }, [])

  const install = useCallback(async () => {
    if (!installPrompt) {
      setShowGuide(true)
      setShowReminder(true)
      return 'unavailable' as const
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') {
      window.localStorage.setItem(dismissedStorageKey, String(Date.now()))
      setInstallPrompt(null)
      setShowGuide(false)
      setShowReminder(false)
      return 'accepted' as const
    }

    dismiss()
    return 'dismissed' as const
  }, [dismiss, installPrompt])

  return {
    canInstall: Boolean(installPrompt),
    dismiss,
    install,
    showGuide,
    showReminder,
  }
}
