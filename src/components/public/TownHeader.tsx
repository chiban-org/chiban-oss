import type { ReactNode } from 'react'

export function TownHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b bg-surface">
      <div className="mx-auto flex w-full max-w-[var(--content-max-width)] flex-wrap items-center justify-between gap-x-6 px-4 py-3">
        <a href="/" className="font-serif text-2xl font-semibold text-ink no-underline">
          Town of Alder Pond
        </a>
        {children}
      </div>
    </header>
  )
}
