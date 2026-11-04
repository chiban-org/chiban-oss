import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Extension } from '@tiptap/react'

export const REPLACE_DOCUMENT = 'replaceDocument'

function lockedCounts(doc: PmNode): Map<string, number> {
  const counts = new Map<string, number>()
  doc.descendants((node) => {
    if (node.type.name !== 'lockedBlock') return true
    const source = String(node.attrs.source)
    counts.set(source, (counts.get(source) ?? 0) + 1)
    return false
  })
  return counts
}

export function keepsLockedBlocks(before: PmNode, after: PmNode): boolean {
  const held = lockedCounts(after)
  return [...lockedCounts(before)].every(([source, count]) => (held.get(source) ?? 0) >= count)
}

export const LockedGuard = Extension.create({
  name: 'lockedGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('lockedGuard'),
        filterTransaction: (tr, state) =>
          !tr.docChanged ||
          tr.getMeta(REPLACE_DOCUMENT) === true ||
          keepsLockedBlocks(state.doc, tr.doc),
      }),
    ]
  },
})
