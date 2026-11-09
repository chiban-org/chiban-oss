import type { ReactNode } from 'react'

interface RecordRowProps {
  title: ReactNode
  detail?: ReactNode
  children?: ReactNode
}

export function RecordRow({ title, detail, children }: RecordRowProps) {
  return (
    <li className="record-item flex flex-col gap-2 pb-4">
      <h3 className="m-0">{title}</h3>
      {detail === undefined ? null : <p className="m-0 text-muted-foreground">{detail}</p>}
      {children}
    </li>
  )
}

export function RecordRowLines({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-none flex-col gap-2 p-0">{children}</ul>
}

export function RecordRowLine({ children }: { children: ReactNode }) {
  return <li className="flex flex-wrap items-center gap-x-4 gap-y-1">{children}</li>
}
