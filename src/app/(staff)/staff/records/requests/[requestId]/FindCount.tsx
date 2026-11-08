'use client'

import { useEffect, useRef } from 'react'

export function FindCount({ query, count }: { query: string; count: number }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (query !== '') ref.current?.focus()
  }, [query])
  if (query === '') return null
  const text =
    count === 0
      ? `No document matches ${query}. Try part of its title or the application or case number.`
      : `Found ${count} ${count === 1 ? 'document' : 'documents'} for ${query}.`
  return (
    <p ref={ref} role="status" tabIndex={-1} data-slot="find-count" className="m-0 font-medium">
      {text}
    </p>
  )
}
