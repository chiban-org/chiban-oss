'use client'

import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { BlocksPreview } from '@/components/config/letterBuilder/BlocksPreview'
import { useLetterView } from '@/components/config/letterBuilder/letterView'
import { type DocNode, fieldTableRows } from '@/features/templates/doc/docSchema'
import { lockedSource } from '@/features/templates/doc/lockedSources'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import { mergeFieldLabel } from '@/features/templates/mergeFieldLabels'
import { mergeValue } from '@/features/templates/renderTemplate'
import { SIGNER_ROLE_LABELS, SignerRoleSchema } from '@/features/town/profileSchema'
import { cn } from '@/lib/utils'

function useFieldText(name: string): string {
  const { preview } = useLetterView()
  return preview === null ? mergeFieldLabel(name) : mergeValue(name, preview.values)
}

export function MergeFieldView({ node, selected }: NodeViewProps) {
  const name = String(node.attrs.name)
  const text = useFieldText(name)
  return (
    <NodeViewWrapper
      as="span"
      data-merge-field={name}
      className={cn(
        text === '' ? '' : 'rounded-sm bg-highlight px-1 py-px text-ink',
        selected ? 'ring-2 ring-action' : '',
      )}
    >
      {text}
    </NodeViewWrapper>
  )
}

function BlockFrame({
  title,
  selected,
  icon,
  children,
}: {
  title: string
  selected: boolean
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <NodeViewWrapper
      contentEditable={false}
      className={cn(
        'my-2 rounded-sm border border-dashed border-control-border bg-canvas/60 px-3 py-2 text-sm',
        selected ? 'ring-2 ring-action' : '',
      )}
    >
      <p className="m-0 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        {icon}
        {title}
      </p>
      <div className="mt-1">{children}</div>
    </NodeViewWrapper>
  )
}

function FieldRowValue({ field }: { field: string }) {
  const text = useFieldText(field)
  return <dd className="m-0">{text}</dd>
}

function FieldTableBody({ node }: { node: DocNode }) {
  const rows = fieldTableRows(node)
  if (rows.length === 0) return <p className="m-0 text-muted-foreground">No rows yet.</p>
  return (
    <dl className="m-0 grid grid-cols-[8rem_1fr] gap-x-3">
      {rows.map((row) => (
        <div key={`${row.label}-${row.field}`} className="contents">
          <dt className="text-xs font-bold text-muted-foreground">{row.label}</dt>
          <FieldRowValue field={row.field} />
        </div>
      ))}
    </dl>
  )
}

function LockedBody({ source }: { source: string }) {
  const { preview } = useLetterView()
  const known = lockedSource(source)
  if (preview !== null) {
    const text = preview.locked[source] ?? ''
    return text === '' ? (
      <p className="m-0 text-muted-foreground">Not printed for this record.</p>
    ) : (
      <p className="m-0">{text}</p>
    )
  }
  return <p className="m-0">{known?.fixedText ?? known?.describe ?? ''}</p>
}

function SectionBody({ name }: { name: string }) {
  const { preview } = useLetterView()
  if (preview === null)
    return <p className="m-0 text-muted-foreground">Filled in from the record.</p>
  return <BlocksPreview blocks={preview.sections[name] ?? []} />
}

function ConditionsBody() {
  const { preview } = useLetterView()
  if (preview === null) return <p className="m-0 text-muted-foreground">One row per condition.</p>
  if (preview.conditions.length === 0) {
    return <p className="m-0 text-muted-foreground">No conditions for this record.</p>
  }
  return (
    <ol className="m-0 pl-5">
      {preview.conditions.map((c) => (
        <li key={c}>{c}</li>
      ))}
    </ol>
  )
}

function SignatureBody({ role }: { role: string }) {
  const parsed = SignerRoleSchema.safeParse(role)
  const name = useFieldText(`signer.${role}.name`)
  const roleLabel = parsed.success ? SIGNER_ROLE_LABELS[parsed.data] : role
  return (
    <div className="pt-4">
      <div className="w-60 border-t border-ink" />
      <p className="m-0 font-bold">{name}</p>
      <p className="m-0 text-xs text-muted-foreground">{roleLabel}</p>
    </div>
  )
}

export function BlockView({ node, selected }: NodeViewProps) {
  const { kind } = useLetterView()
  const doc = node.toJSON() as DocNode
  switch (node.type.name) {
    case 'signature':
      return (
        <BlockFrame title="Signature" selected={selected}>
          <SignatureBody role={String(node.attrs.role)} />
        </BlockFrame>
      )
    case 'conditionsList':
      return (
        <BlockFrame title="Conditions list" selected={selected}>
          <ConditionsBody />
        </BlockFrame>
      )
    case 'fieldTable':
      return (
        <BlockFrame title="Field table" selected={selected}>
          <FieldTableBody node={doc} />
        </BlockFrame>
      )
    case 'lockedBlock': {
      const source = String(node.attrs.source)
      const known = lockedSource(source)
      return (
        <BlockFrame
          title={`${known?.label ?? source}. ${known?.reason ?? 'Locked'}`}
          selected={selected}
          icon={<Lock aria-label="Locked" className="size-3.5" />}
        >
          <LockedBody source={source} />
        </BlockFrame>
      )
    }
    default: {
      const name = String(node.attrs.name)
      const label = documentKind(kind).sections.find((s) => s.name === name)?.label ?? name
      return (
        <BlockFrame title={label} selected={selected}>
          <SectionBody name={name} />
        </BlockFrame>
      )
    }
  }
}
