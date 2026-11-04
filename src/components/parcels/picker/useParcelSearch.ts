import { useEffect, useState } from 'react'
import type { PickedParcel } from '@/features/parcels/parcelPick'
import { MIN_PICK_QUERY, type ParcelSearch } from './pickerChoice'

export type SearchState =
  | { phase: 'idle' }
  | { phase: 'loading'; query: string }
  | { phase: 'done'; query: string; hits: PickedParcel[] }
  | { phase: 'failed'; query: string }

const PAUSE_MS = 250
const IDLE: SearchState = { phase: 'idle' }

export function useParcelSearch(search: ParcelSearch, query: string): SearchState {
  const [state, setState] = useState<SearchState>(IDLE)
  const trimmed = query.trim()
  useEffect(() => {
    if (trimmed.length < MIN_PICK_QUERY) {
      setState(IDLE)
      return
    }
    setState({ phase: 'loading', query: trimmed })
    const controller = new AbortController()
    const timer = setTimeout(() => {
      search(trimmed, controller.signal).then(
        (hits) => {
          if (!controller.signal.aborted) setState({ phase: 'done', query: trimmed, hits })
        },
        () => {
          if (!controller.signal.aborted) setState({ phase: 'failed', query: trimmed })
        },
      )
    }, PAUSE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, trimmed])
  return state
}
