import type { DocumentFrame } from '@/features/pdf/frame'
import type { SignerRole } from '@/features/town/profileSchema'

export interface SignaturePerson {
  name: string
  title: string
}

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
}

export interface PdfListItem {
  marker: string
  depth: number
  runs: TextRun[]
}

export type PdfBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'text'; runs: TextRun[] }
  | { kind: 'list'; items: PdfListItem[] }
  | { kind: 'fields'; rows: { label: string; value: string }[] }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'signature'; role: SignerRole; label: string; person?: SignaturePerson }
  | { kind: 'notice'; text: string }

export interface PdfDocumentSpec {
  title: string
  subtitle?: string
  frame: DocumentFrame
  blocks: PdfBlock[]
  scale: 'document' | 'placard'
}
