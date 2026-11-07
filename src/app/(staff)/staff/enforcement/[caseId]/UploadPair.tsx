'use client'

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

interface Pair {
  armed: number
  arm: () => void
}

const PairContext = createContext<Pair | null>(null)

export function UploadPair({ children }: { children: ReactNode }) {
  const [armed, setArmed] = useState(0)
  const pair = useMemo(() => ({ armed, arm: () => setArmed((n) => n + 1) }), [armed])
  return <PairContext.Provider value={pair}>{children}</PairContext.Provider>
}

export function useUploadPair(): Pair | null {
  return useContext(PairContext)
}
