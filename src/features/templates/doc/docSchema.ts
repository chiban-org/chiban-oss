import { z } from 'zod'

export const DOC_NODE_TYPES = [
  'doc',
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'text',
  'hardBreak',
  'mergeField',
  'signature',
  'conditionsList',
  'fieldTable',
  'noticeBox',
  'lockedBlock',
  'recordSection',
] as const
export type DocNodeType = (typeof DOC_NODE_TYPES)[number]

export const DOC_MARKS = ['bold', 'italic'] as const
export type DocMark = (typeof DOC_MARKS)[number]

export interface DocNode {
  type: DocNodeType
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
  marks?: { type: DocMark; attrs?: Record<string, unknown> }[]
}

export const DocNodeSchema: z.ZodType<DocNode> = z.lazy(() =>
  z.object({
    type: z.enum(DOC_NODE_TYPES),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(DocNodeSchema).optional(),
    text: z.string().optional(),
    marks: z
      .array(
        z.object({ type: z.enum(DOC_MARKS), attrs: z.record(z.string(), z.unknown()).optional() }),
      )
      .optional(),
  }),
)

export const TemplateDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(DocNodeSchema).min(1, 'Write something in the letter.'),
})
export type TemplateDoc = z.infer<typeof TemplateDocSchema>

export interface FieldTableRow {
  label: string
  field: string
}

export function stringAttr(node: DocNode, name: string): string {
  const value: unknown = new Map(Object.entries(node.attrs ?? {})).get(name)
  return typeof value === 'string' ? value : ''
}

export function fieldTableRows(node: DocNode): FieldTableRow[] {
  const rows = node.attrs?.rows
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row: unknown) => {
    if (typeof row !== 'object' || row === null) return []
    const { label, field } = row as Record<string, unknown>
    return typeof label === 'string' && typeof field === 'string' ? [{ label, field }] : []
  })
}

export function walkDoc(nodes: readonly DocNode[], visit: (node: DocNode) => void): void {
  for (const node of nodes) {
    visit(node)
    if (node.content !== undefined) walkDoc(node.content, visit)
  }
}
