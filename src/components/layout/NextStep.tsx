import type { ReactNode } from 'react'

export function NextStep({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Next step" data-plain className="flex flex-col items-stretch gap-3">
      <h2 className="font-sans text-sm font-semibold text-muted-foreground">Next step</h2>
      {children}
    </section>
  )
}
