'use client'

import { createContext, useContext } from 'react'

export type LiveAnswers = Readonly<Record<string, unknown>>

export const LiveAnswersContext = createContext<LiveAnswers | null>(null)

export function useLiveAnswers(): LiveAnswers | null {
  return useContext(LiveAnswersContext)
}
