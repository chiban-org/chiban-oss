import type { ReactNode } from 'react'

export function KeyFacts({
  children,
  note,
  stacked = false,
}: {
  children: ReactNode
  note?: ReactNode
  stacked?: boolean
}) {
  return (
    <div data-slot="key-facts" className="toolbar grid gap-2">
      <div className={stacked ? 'grid gap-2' : 'flex flex-wrap items-center gap-x-6 gap-y-2'}>
        {children}
      </div>
      {note === undefined ? null : <p className="m-0 text-sm text-muted-foreground">{note}</p>}
    </div>
  )
}
