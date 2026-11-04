import { type DocNode, stringAttr, type TemplateDoc } from '@/features/templates/doc/docSchema'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import type { TemplateKind } from '@/features/templates/templateSchema'

function belongs(node: DocNode, kind: TemplateKind): boolean {
  const def = documentKind(kind)
  if (node.type === 'lockedBlock') {
    return def.locked.some((source) => source === stringAttr(node, 'source'))
  }
  if (node.type === 'recordSection') {
    return def.sections.some((s) => s.name === stringAttr(node, 'name'))
  }
  return true
}

export function fitDocToKind(doc: TemplateDoc, kind: TemplateKind): TemplateDoc {
  const kept = doc.content.filter((node) => belongs(node, kind))
  const present = new Set(
    kept.filter((n) => n.type === 'lockedBlock').map((n) => stringAttr(n, 'source')),
  )
  const added = documentKind(kind)
    .locked.filter((source) => !present.has(source))
    .map((source): DocNode => ({ type: 'lockedBlock', attrs: { source } }))
  const content = [...kept, ...added]
  return { type: 'doc', content: content.length === 0 ? [{ type: 'paragraph' }] : content }
}
