'use client'

import type { Editor, JSONContent } from '@tiptap/react'
import {
  Braces,
  FileSignature,
  ListChecks,
  Lock,
  type LucideIcon,
  Megaphone,
  Rows3,
  TableProperties,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { lockedSource } from '@/features/templates/doc/lockedSources'
import { defaultSignerRole } from '@/features/templates/kinds/defaultSigner'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import { fieldGroups } from '@/features/templates/kinds/fieldGroups'
import type { TemplateKind } from '@/features/templates/templateSchema'

interface Props {
  editor: Editor
  kind: TemplateKind
  missingLocked: readonly string[]
  disabled: boolean
}

function InsertButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string
  icon: LucideIcon
  disabled: boolean
  onClick: () => void
}) {
  return (
    <li>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-auto min-h-8 w-full justify-start gap-2 bg-surface py-1 text-left whitespace-normal"
        disabled={disabled}
        onClick={onClick}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        {label}
      </Button>
    </li>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group" open>
      <summary className="cursor-pointer py-1 text-xs font-bold text-muted-foreground">
        {title}
      </summary>
      <ul className="m-0 mt-1 grid list-none gap-1.5 p-0">{children}</ul>
    </details>
  )
}

export function InsertPanel({ editor, kind, missingLocked, disabled }: Props) {
  const insert = (content: JSONContent) => editor.chain().focus().insertContent(content).run()
  const def = documentKind(kind)
  const blocks: [string, LucideIcon, JSONContent][] = [
    ['Signature', FileSignature, { type: 'signature', attrs: { role: defaultSignerRole(kind) } }],
    ['Conditions list', ListChecks, { type: 'conditionsList' }],
    ['Field table', TableProperties, { type: 'fieldTable', attrs: { rows: [] } }],
    ['Notice box', Megaphone, { type: 'noticeBox', content: [{ type: 'text', text: 'Notice' }] }],
  ]
  return (
    <nav aria-label="Insert" className="grid min-w-0 content-start gap-3">
      <h2 className="m-0 font-sans text-sm font-bold text-muted-foreground">Insert</h2>
      {missingLocked.length === 0 ? null : (
        <Group title="Required by state law">
          {missingLocked.map((source) => (
            <InsertButton
              key={source}
              label={lockedSource(source)?.label ?? source}
              icon={Lock}
              disabled={disabled}
              onClick={() => insert({ type: 'lockedBlock', attrs: { source } })}
            />
          ))}
        </Group>
      )}
      <Group title="Blocks">
        {blocks.map(([label, icon, content]) => (
          <InsertButton
            key={label}
            label={label}
            icon={icon}
            disabled={disabled}
            onClick={() => insert(content)}
          />
        ))}
      </Group>
      {def.sections.length === 0 ? null : (
        <Group title="Filled in from the record">
          {def.sections.map((s) => (
            <InsertButton
              key={s.name}
              label={s.label}
              icon={Rows3}
              disabled={disabled}
              onClick={() => insert({ type: 'recordSection', attrs: { name: s.name } })}
            />
          ))}
        </Group>
      )}
      {fieldGroups(kind).map((group) => (
        <Group key={group.title} title={`Merge fields: ${group.title}`}>
          {group.fields.map((field) => (
            <InsertButton
              key={field.name}
              label={field.label}
              icon={Braces}
              disabled={disabled}
              onClick={() => insert({ type: 'mergeField', attrs: { name: field.name } })}
            />
          ))}
        </Group>
      ))}
    </nav>
  )
}
