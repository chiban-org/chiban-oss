'use client'

import { useEffect } from 'react'

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function ParcelSearchHotkey() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/') return
      const active = document.activeElement
      if (active !== null && TYPING_TAGS.has(active.tagName)) return
      const search = document.querySelector<HTMLInputElement>('input[name="q"]')
      if (search === null) return
      event.preventDefault()
      search.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return null
}
