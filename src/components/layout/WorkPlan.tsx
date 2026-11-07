import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

export interface WorkWarning {
  key: string
  text: string
}

export function DoThisNowCard({
  task,
  note,
  warnings,
  children,
}: {
  task: string
  note: string | null
  warnings: readonly WorkWarning[]
  children?: ReactNode
}) {
  return (
    <section aria-label="Do this now" id="do-this-now" className="flex flex-col gap-3 [&>*]:m-0">
      <h2 className="font-sans text-sm font-semibold text-muted-foreground">Do this now</h2>
      <p className="font-serif text-xl font-semibold text-ink">{task}</p>
      {note === null ? null : <p className="text-ink-secondary">{note}</p>}
      {warnings.map((warning) => (
        <p
          key={warning.key}
          className="flex items-start gap-2 font-semibold text-status-overdue-fg"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden={true} />
          <span>
            <span className="sr-only">Warning: </span>
            {warning.text}
          </span>
        </p>
      ))}
      {children}
    </section>
  )
}

export function StatusMark({ done }: { done: boolean }) {
  const Icon = done ? CircleCheck : CircleX
  return (
    <>
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${done ? 'text-status-passed-fg' : 'text-status-failed-fg'}`}
        aria-hidden={true}
      />
      <span className="sr-only">{done ? 'Done: ' : 'Not done: '}</span>
    </>
  )
}

export function RequirementItem({
  done,
  label,
  anchor,
  detail,
  children,
}: {
  done: boolean
  label: string
  anchor: string
  detail: string
  children?: ReactNode
}) {
  return (
    <li className="record-item flex flex-col gap-2 pb-3 [&>*]:m-0">
      <p className="flex items-start gap-2">
        <StatusMark done={done} />
        {done ? (
          <span>{label}</span>
        ) : (
          <a href={`#${anchor}`} className="font-semibold">
            {label}
          </a>
        )}
      </p>
      {detail === '' ? null : <p className="pl-6 text-sm text-ink-secondary">{detail}</p>}
      <div className="flex flex-col gap-2 pl-6 empty:hidden">{children}</div>
    </li>
  )
}

export function RequirementsPanel({
  groups,
}: {
  groups: readonly { key: string; title: string; items: ReactNode }[]
}) {
  if (groups.length === 0) return null
  return (
    <section aria-label="Requirements" id="requirements">
      <h2>Requirements</h2>
      {groups.map((group) => (
        <section key={group.key} aria-label={group.title}>
          <h3>{group.title}</h3>
          <ul aria-label={group.title} className="flex list-none flex-col gap-3 p-0">
            {group.items}
          </ul>
        </section>
      ))}
    </section>
  )
}
