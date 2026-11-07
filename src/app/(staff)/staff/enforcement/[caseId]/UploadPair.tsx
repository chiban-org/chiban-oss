'use client'

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

interface Pair {
  uploadedId: string | null
  uploaded: (documentId: string) => void
}

const PairContext = createContext<Pair | null>(null)

export function UploadPair({ children }: { children: ReactNode }) {
  const [uploadedId, setUploadedId] = useState<string | null>(null)
  const pair = useMemo(() => ({ uploadedId, uploaded: setUploadedId }), [uploadedId])
  return <PairContext.Provider value={pair}>{children}</PairContext.Provider>
}

export function useUploadPair(): Pair | null {
  return useContext(PairContext)
}
