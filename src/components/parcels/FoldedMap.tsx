'use client'

import { type ReactNode, useState } from 'react'

export function FoldedMap({ summary, children }: { summary: string; children: ReactNode }) {
  const [opened, setOpened] = useState(false)
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true)
      }}
    >
      <summary className="cursor-pointer py-2 font-semibold text-action">{summary}</summary>
      {opened ? <div className="mt-3">{children}</div> : null}
    </details>
  )
}
