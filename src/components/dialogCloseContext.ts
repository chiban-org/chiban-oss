'use client'

import { createContext, useContext } from 'react'

const DialogCloseContext = createContext<(() => void) | null>(null)

export const DialogCloseProvider = DialogCloseContext.Provider

export function useCloseEnclosingDialog(): (() => void) | null {
  return useContext(DialogCloseContext)
}
