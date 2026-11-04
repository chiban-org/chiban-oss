'use client'

import { NodeSelection } from '@tiptap/pm/state'
import { type Editor, useEditorState } from '@tiptap/react'
import { FieldTableSettings } from '@/components/config/letterBuilder/FieldTableSettings'
import { Pick, RowButton } from '@/components/config/primitives'
import {
  type DocNode,
  type FieldTableRow,
  fieldTableRows,
} from '@/features/templates/doc/docSchema'
import { lockedSource } from '@/features/templates/doc/lockedSources'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import { fieldGroups } from '@/features/templates/kinds/fieldGroups'
import type { TemplateKind } from '@/features/templates/templateSchema'
import { SIGNER_ROLE_LABELS, SIGNER_ROLES } from '@/features/town/profileSchema'

interface Selected {
  type: string
  attrs: Record<string, unknown>
  pos: number
}

function selectedNode(editor: Editor): Selected | null {
  const { selection } = editor.state
  if (!(selection instanceof NodeSelection)) return null
  return { type: selection.node.type.name, attrs: { ...selection.node.attrs }, pos: selection.from }
}

const ROLE_OPTIONS = SIGNER_ROLES.map((role): [string, string] => [role, SIGNER_ROLE_LABELS[role]])

function Hint({ children }: { children: string }) {
  return <p className="m-0 text-sm text-muted-foreground">{children}</p>
}

export function BlockSettings({ editor, kind }: { editor: Editor; kind: TemplateKind }) {
  const selected = useEditorState({ editor, selector: ({ editor: e }) => selectedNode(e) })
  if (selected === null) {
    return <Hint>Select a merge field or a block in the letter to change it.</Hint>
  }
  const setAttrs = (attrs: Record<string, unknown>) =>
    editor.chain().setNodeSelection(selected.pos).updateAttributes(selected.type, attrs).run()
  const remove = () => editor.chain().setNodeSelection(selected.pos).deleteSelection().run()
  const fieldOptions = fieldGroups(kind).flatMap((g) =>
    g.fields.map((f): [string, string] => [f.name, `${g.title}: ${f.label}`]),
  )
  switch (selected.type) {
    case 'mergeField':
      return (
        <div className="grid gap-3">
          <Pick
            label="Merge field"
            value={String(selected.attrs.name)}
            options={fieldOptions}
            onChange={(e) => setAttrs({ name: e.target.value })}
          />
          <RowButton onClick={remove}>Remove merge field</RowButton>
        </div>
      )
    case 'signature':
      return (
        <div className="grid gap-3">
          <Pick
            label="Who signs"
            value={String(selected.attrs.role)}
            options={ROLE_OPTIONS}
            onChange={(e) => setAttrs({ role: e.target.value })}
          />
          <Hint>The name, title and signature image come from the Signers settings.</Hint>
          <RowButton onClick={remove}>Remove signature</RowButton>
        </div>
      )
    case 'fieldTable':
      return (
        <div className="grid gap-3">
          <FieldTableSettings
            rows={fieldTableRows({ type: 'fieldTable', attrs: selected.attrs })}
            fieldOptions={fieldOptions}
            onChange={(rows: FieldTableRow[]) => setAttrs({ rows })}
          />
          <RowButton onClick={remove}>Remove field table</RowButton>
        </div>
      )
    case 'lockedBlock': {
      const source = lockedSource(String(selected.attrs.source))
      return (
        <div className="grid gap-2">
          <p className="m-0 font-bold">{source?.label ?? 'Locked wording'}</p>
          <Hint>{`${source?.reason ?? 'Required'}. This wording comes from the state law pack, so it cannot be changed or removed. ${source?.describe ?? ''}`}</Hint>
        </div>
      )
    }
    case 'recordSection': {
      const name = String(selected.attrs.name)
      const label = documentKind(kind).sections.find((s) => s.name === name)?.label ?? name
      return (
        <div className="grid gap-3">
          <p className="m-0 font-bold">{label}</p>
          <Hint>
            Filled in from the record when the document is made. Write the words around it.
          </Hint>
          <RowButton onClick={remove}>Remove this part</RowButton>
        </div>
      )
    }
    default:
      return (
        <div className="grid gap-3">
          <Hint>One row for each condition on the record.</Hint>
          <RowButton onClick={remove}>Remove conditions list</RowButton>
        </div>
      )
  }
}
