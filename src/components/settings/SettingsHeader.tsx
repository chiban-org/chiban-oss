import Link from 'next/link'
import type { ReactNode } from 'react'

export const VERSIONED_LINE =
  'Each change is a new version. Open applications keep the version they started under.'

export interface SettingsBackLink {
  href: string
  label: string
}

export function SettingsHeader({
  title,
  lead,
  versioned = false,
  back,
  action,
}: {
  title: string
  lead: string
  versioned?: boolean
  back?: SettingsBackLink
  action?: ReactNode
}) {
  return (
    <header className="settings-header mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="max-w-[75ch] min-w-0 flex-1 basis-80">
        {back === undefined ? null : (
          <p className="m-0 mb-1 text-sm">
            <Link href={back.href}>{back.label}</Link>
          </p>
        )}
        <h1 className="m-0 mb-1 [overflow-wrap:anywhere]">{title}</h1>
        <p className="m-0 text-muted-foreground">
          {versioned ? `${lead} ${VERSIONED_LINE}` : lead}
        </p>
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </header>
  )
}
