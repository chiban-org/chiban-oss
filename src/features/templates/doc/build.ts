import type { DocNode, FieldTableRow, TemplateDoc } from '@/features/templates/doc/docSchema'
import type { LockedSourceKey } from '@/features/templates/doc/lockedSources'
import { inlineNodes } from '@/features/templates/doc/textToDoc'
import type { MergeField } from '@/features/templates/mergeFields'
import type { SignerRole } from '@/features/town/profileSchema'

export const doc = (...content: DocNode[]): TemplateDoc => ({ type: 'doc', content })

export const para = (text: string): DocNode => ({ type: 'paragraph', content: inlineNodes(text) })

export const heading = (text: string): DocNode => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
})

export const fields = (rows: readonly [string, MergeField][]): DocNode => ({
  type: 'fieldTable',
  attrs: { rows: rows.map(([label, field]): FieldTableRow => ({ label, field })) },
})

export const section = (name: string): DocNode => ({ type: 'recordSection', attrs: { name } })

export const locked = (source: LockedSourceKey): DocNode => ({
  type: 'lockedBlock',
  attrs: { source },
})

export const signature = (role: SignerRole): DocNode => ({ type: 'signature', attrs: { role } })

export const conditions = (): DocNode => ({ type: 'conditionsList' })

export const notice = (text: string): DocNode => ({ type: 'noticeBox', content: inlineNodes(text) })
