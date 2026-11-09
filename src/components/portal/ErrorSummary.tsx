'use client'

import { type RefObject, useEffect } from 'react'

export interface SummaryEntry {
  target: string
  label: string
  message: string
}

function focusTarget(id: string): void {
  const target = document.getElementById(id)
  if (target === null) return
  const focusable = target.matches('input, textarea, button, select, [tabindex]')
    ? target
    : target.querySelector<HTMLElement>('input, textarea, button, select, [role="radio"]')
  target.scrollIntoView({ block: 'center' })
  ;(focusable ?? target).focus()
}

export function ErrorSummary({
  entries,
  attempt,
  headingRef,
}: {
  entries: readonly SummaryEntry[]
  attempt: number
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  useEffect(() => {
    if (attempt > 0) headingRef.current?.focus()
  }, [attempt, headingRef])
  if (entries.length === 0) return null
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border-2 border-destructive p-4">
      <h3 ref={headingRef} tabIndex={-1} className="m-0 text-lg font-bold">
        {entries.length === 1 ? 'Fix this before you submit' : 'Fix these before you submit'}
      </h3>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
        {entries.map((entry) => (
          <li key={entry.target}>
            <a
              href={`#${entry.target}`}
              className="tap-target inline-flex items-center font-medium text-destructive"
              onClick={(event) => {
                event.preventDefault()
                focusTarget(entry.target)
              }}
            >
              {`${entry.label}: ${entry.message}`}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
