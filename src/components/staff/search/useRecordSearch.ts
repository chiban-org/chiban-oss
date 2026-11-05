import { useEffect, useState } from 'react'
import { MIN_SEARCH_CHARS, type SearchResult } from '@/features/search/searchTypes'
import type { FindRecords } from './findRecordsClient'

export type RecordSearchState =
  | { phase: 'idle' }
  | { phase: 'loading'; query: string }
  | { phase: 'done'; query: string; result: SearchResult }
  | { phase: 'failed'; query: string }

const PAUSE_MS = 250
const IDLE: RecordSearchState = { phase: 'idle' }

export function useRecordSearch(find: FindRecords, query: string): RecordSearchState {
  const [state, setState] = useState<RecordSearchState>(IDLE)
  const trimmed = query.trim()
  useEffect(() => {
    if (trimmed.length < MIN_SEARCH_CHARS) {
      setState(IDLE)
      return
    }
    setState({ phase: 'loading', query: trimmed })
    const controller = new AbortController()
    const timer = setTimeout(() => {
      find(trimmed, controller.signal).then(
        (result) => {
          if (!controller.signal.aborted) setState({ phase: 'done', query: trimmed, result })
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
  }, [find, trimmed])
  return state
}
