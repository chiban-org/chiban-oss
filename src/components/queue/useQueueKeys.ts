'use client'

import { useEffect } from 'react'

export const QUEUE_SEARCH_ID = 'queue-search'

const NON_TEXT_INPUTS = new Set([
  'checkbox',
  'radio',
  'submit',
  'button',
  'reset',
  'range',
  'file',
  'color',
])

const ACTIVATES_ON_ENTER = 'a,button,input,select,textarea,summary,[role="dialog"]'

export interface QueueKeyActions {
  count: number
  selected: number
  paused: boolean
  step: (delta: 1 | -1) => void
  open: (index: number) => void
  assign: ((index: number) => void) | null
}

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type)
  return target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

function activatesOnEnter(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(ACTIVATES_ON_ENTER) !== null
}

function leftSearch(event: KeyboardEvent): boolean {
  const target = event.target
  if (event.key !== 'Escape' || !(target instanceof HTMLElement)) return false
  if (target.id !== QUEUE_SEARCH_ID) return false
  target.blur()
  return true
}

function runRowShortcut(event: KeyboardEvent, actions: QueueKeyActions) {
  const { count, selected } = actions
  if (count === 0) return
  switch (event.key) {
    case 'j':
      actions.step(1)
      return
    case 'k':
      actions.step(-1)
      return
    case 'Enter':
      if (!activatesOnEnter(event.target)) actions.open(selected)
      return
    case 'a':
      actions.assign?.(selected)
      return
  }
}

function runShortcut(event: KeyboardEvent, actions: QueueKeyActions) {
  if (event.key !== '/') {
    runRowShortcut(event, actions)
    return
  }
  event.preventDefault()
  document.getElementById(QUEUE_SEARCH_ID)?.focus()
}

function ignored(event: KeyboardEvent, actions: QueueKeyActions): boolean {
  return actions.paused || event.metaKey || event.ctrlKey || event.altKey
}

export function useQueueKeys(actions: QueueKeyActions) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (ignored(event, actions) || leftSearch(event) || typingInField(event.target)) return
      runShortcut(event, actions)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions])
}
