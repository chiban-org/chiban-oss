'use client'

import { createContext, type ReactNode, useContext } from 'react'
import { NEUTRAL_PACK_TEXT } from '@/features/packs/neutralPackText'
import type { PackText } from '@/features/packs/packText'

const Context = createContext<PackText>(NEUTRAL_PACK_TEXT)

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
