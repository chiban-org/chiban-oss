'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-status-failed-fg">
      {' *'}
    </span>
  )
}

function useFormHasRequired() {
  const ref = useRef<HTMLParagraphElement>(null)
  const [found, setFound] = useState(false)
  useEffect(() => {
    const form = ref.current?.closest('form')
    if (form === null || form === undefined) return
    const check = () => setFound(form.querySelector('[required], [aria-required="true"]') !== null)
    check()
    const observer = new MutationObserver(check)
    observer.observe(form, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['required', 'aria-required'],
    })
    return () => observer.disconnect()
  }, [])
  return { ref, found }
}

export function RequiredNote({ className }: { className?: string }) {
  const { ref, found } = useFormHasRequired()
  return (
    <p
      ref={ref}
      hidden={!found}
      data-slot="required-note"
      className={cn('text-sm text-muted-foreground', className)}
    >
      <span aria-hidden="true">*</span> Required
    </p>
  )
}
