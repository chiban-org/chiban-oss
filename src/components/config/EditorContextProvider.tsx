'use client'

import { createContext, type ReactNode, useContext } from 'react'
import type { EditorContext } from '@/features/config/editorContext'

const EMPTY: EditorContext = {
  packRules: [],
  classifications: [],
  mergeFields: [],
  townRules: {},
}

const Context = createContext<EditorContext>(EMPTY)

export function EditorContextProvider({
  value,
  children,
}: {
  value: EditorContext
  children: ReactNode
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useEditorContext(): EditorContext {
  return useContext(Context)
}
