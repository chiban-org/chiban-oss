import type { ReactNode } from 'react'

export interface Fact {
  label: string
  value: ReactNode
}

interface PageHeaderProps {
  title: ReactNode
  kicker?: ReactNode
  status?: ReactNode
  lead?: ReactNode
  facts?: readonly Fact[]
  actions?: ReactNode
}

export function FactList({
  facts,
  stacked = false,
}: {
  facts: readonly Fact[]
  stacked?: boolean
}) {
  return (
    <dl className={stacked ? 'flex flex-col gap-3' : 'flex flex-wrap gap-x-10 gap-y-3'}>
      {facts.map((fact) => (
        <div key={fact.label} className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold text-muted-foreground">{fact.label}</dt>
          <dd className="text-ink">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function PageHeader({ title, kicker, status, lead, facts, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-4 border-b pb-8">
      <div className="flex flex-col gap-2">
        {kicker === undefined ? null : (
          <p className="text-sm font-semibold text-muted-foreground">{kicker}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1>{title}</h1>
          {status}
        </div>
        {lead === undefined ? null : (
          <p className="max-w-[65ch] text-lg text-ink-secondary">{lead}</p>
        )}
      </div>
      {facts === undefined || facts.length === 0 ? null : <FactList facts={facts} />}
      {actions}
    </header>
  )
}
