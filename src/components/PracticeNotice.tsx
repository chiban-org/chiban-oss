import type { ReactNode } from 'react'

export function PracticeNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="note"
      data-slot="practice-notice"
      className="m-0 max-w-[75ch] rounded-md border border-dashed border-control-border bg-surface px-3 py-2"
    >
      {children}
    </p>
  )
}
