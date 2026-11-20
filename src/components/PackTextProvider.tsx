'use client'

import { createContext, type ReactNode, useContext } from 'react'
import type { PackText } from '@/features/packs/packText'
import { packVocabulary } from '@/features/packs/vocabulary'

const EMPTY: PackText = {
  signerRoleLabels: {},
  lockedTexts: {},
  environmentalAgency: 'State environmental agency',
  vocabulary: packVocabulary(),
}

const Context = createContext<PackText>(EMPTY)

export function PackTextProvider({ value, children }: { value: PackText; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function usePackText(): PackText {
  return useContext(Context)
}

export function useSignerRoleLabel(): (role: string) => string {
  const { signerRoleLabels } = usePackText()
  return (role) => signerRoleLabels[role] ?? role
}
