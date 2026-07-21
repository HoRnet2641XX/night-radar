'use client'

import { useEffect } from 'react'

export function ShareForwarder() {
  useEffect(() => {
    window.location.replace('/app')
  }, [])

  return null
}
