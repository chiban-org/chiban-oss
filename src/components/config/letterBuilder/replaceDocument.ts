import type { Editor } from '@tiptap/react'
import { REPLACE_DOCUMENT } from '@/components/config/letterBuilder/lockedGuard'
import type { TemplateDoc } from '@/features/templates/doc/docSchema'

export function replaceDocument(editor: Editor, doc: TemplateDoc): void {
  if (editor.isDestroyed) return
  const node = editor.schema.nodeFromJSON(doc)
  const { state } = editor
  editor.view.dispatch(
    state.tr
      .replaceWith(0, state.doc.content.size, node.content)
      .setMeta(REPLACE_DOCUMENT, true)
      .setMeta('addToHistory', false),
  )
}
