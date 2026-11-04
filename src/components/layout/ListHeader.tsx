import type { ReactNode } from 'react'

export function ListHeader({
  title,
  lead,
  actions,
}: {
  title: string
  lead: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="max-w-[75ch] min-w-0 flex-1 basis-80">
        <h1 className="m-0 mb-1 [overflow-wrap:anywhere]">{title}</h1>
        <p className="m-0 text-muted-foreground">{lead}</p>
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>
      )}
    </header>
  )
}

export function SectionHeader({
  id,
  title,
  action,
}: {
  id: string
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id={id} className="m-0">
        {title}
      </h2>
      {action}
    </div>
  )
}
