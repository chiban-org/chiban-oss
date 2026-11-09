'use client'

import { createContext, useContext } from 'react'
import type { ActionResult } from '@/server/actionRunner'

export interface TakeBoard {
  onTaken: (inspectionId: string) => void
  status: string | null
}

const NONE: TakeBoard = { onTaken: () => undefined, status: null }

const BoardContext = createContext<TakeBoard>(NONE)
const CloseContext = createContext<() => void>(() => undefined)

export const TakeBoardProvider = BoardContext.Provider
export const TakeCloseProvider = CloseContext.Provider

export function useTakeStatus(): string | null {
  return useContext(BoardContext).status
}

export function useTaken(): (result: Extract<ActionResult, { ok: true }>) => void {
  const board = useContext(BoardContext)
  const close = useContext(CloseContext)
  return (result) => {
    if (result.createdId === undefined) return
    close()
    board.onTaken(result.createdId)
  }
}
