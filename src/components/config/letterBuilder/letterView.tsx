'use client'

import { createContext, type ReactNode, useContext } from 'react'
import type { PdfBlock } from '@/features/pdf/pdfSpec'
import type { TemplateKind } from '@/features/templates/templateSchema'

export interface LetterPreview {
  recordLabel: string
  values: Record<string, string>
  locked: Record<string, string>
  sections: Record<string, PdfBlock[]>
  conditions: string[]
}

export interface LetterView {
  kind: TemplateKind
  preview: LetterPreview | null
}

const LetterViewContext = createContext<LetterView>({ kind: 'letter', preview: null })

export function LetterViewProvider({
  value,
  children,
}: {
  value: LetterView
  children: ReactNode
}) {
  return <LetterViewContext.Provider value={value}>{children}</LetterViewContext.Provider>
}

export function useLetterView(): LetterView {
  return useContext(LetterViewContext)
}
