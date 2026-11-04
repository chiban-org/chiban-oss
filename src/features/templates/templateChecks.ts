import { stringAttr, walkDoc } from '@/features/templates/doc/docSchema'
import { lockedSource } from '@/features/templates/doc/lockedSources'
import { allowedFields, documentKind } from '@/features/templates/kinds/documentKinds'
import { isMergeField, scanTokens } from '@/features/templates/mergeFields'
import { isDocTemplate, type TemplateBody } from '@/features/templates/templateSchema'

export interface TemplateUse {
  fields: string[]
  locked: string[]
  sections: string[]
}

function docUse(template: Extract<TemplateBody, { format: 'doc' }>): TemplateUse {
  const use: TemplateUse = { fields: [], locked: [], sections: [] }
  walkDoc(template.doc.content, (node) => {
    if (node.type === 'mergeField') use.fields.push(stringAttr(node, 'name'))
    if (node.type === 'recordSection') use.sections.push(stringAttr(node, 'name'))
    if (node.type === 'fieldTable') {
      const rows = node.attrs?.rows
      if (Array.isArray(rows)) {
        for (const row of rows as { field?: unknown }[]) {
          if (typeof row.field === 'string') use.fields.push(row.field)
        }
      }
    }
  })
  use.locked = template.doc.content
    .filter((node) => node.type === 'lockedBlock')
    .map((node) => stringAttr(node, 'source'))
  return use
}

export function templateUse(template: TemplateBody): TemplateUse {
  if (isDocTemplate(template)) return docUse(template)
  const names = scanTokens(template.body).map((t) => t.name)
  return {
    fields: names.filter((n) => lockedSource(n) === null),
    locked: names.filter((n) => lockedSource(n) !== null),
    sections: [],
  }
}

const unique = (values: string[]) => [...new Set(values)]

export type TemplateCheck =
  | { unknownMergeFields: string[] }
  | { disallowedMergeFields: string[] }
  | { missingLockedBlocks: string[] }
  | { unknownBlocks: string[] }

export function unknownTemplateFields(template: TemplateBody): string[] {
  const use = templateUse(template)
  return unique(use.fields.filter((name) => !isMergeField(name)))
}

export function checkTemplate(template: TemplateBody): TemplateCheck | null {
  const use = templateUse(template)
  const unknown = unique(use.fields.filter((name) => !isMergeField(name)))
  if (unknown.length > 0) return { unknownMergeFields: unknown }
  const allowed = allowedFields(template.kind)
  const disallowed = unique(use.fields.filter((name) => isMergeField(name) && !allowed.has(name)))
  if (disallowed.length > 0) return { disallowedMergeFields: disallowed }
  const kind = documentKind(template.kind)
  const known = new Set(kind.sections.map((s) => s.name))
  const unknownBlocks = unique([
    ...use.sections.filter((name) => !known.has(name)),
    ...use.locked.filter((source) => !kind.locked.some((own) => own === source)),
  ])
  if (unknownBlocks.length > 0) return { unknownBlocks }
  const missing = kind.locked.filter((source) => !use.locked.includes(source))
  return missing.length > 0 ? { missingLockedBlocks: [...missing] } : null
}
