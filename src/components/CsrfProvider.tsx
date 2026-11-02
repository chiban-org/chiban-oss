'use client'

import { createContext, type ReactNode, useContext } from 'react'

const CsrfContext = createContext('')

export function CsrfProvider({ token, children }: { token: string; children: ReactNode }) {
  return <CsrfContext.Provider value={token}>{children}</CsrfContext.Provider>
}

export function useCsrfToken(): string {
  return useContext(CsrfContext)
}
