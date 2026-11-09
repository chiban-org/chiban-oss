import type { ReactNode } from 'react'
import { NEW_TAB } from '@/components/newTab'

export const LINK = 'tap-target inline-flex items-center'

export function NewTabLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a {...NEW_TAB} href={href} className={LINK}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
