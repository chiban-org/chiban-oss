import type { ReactNode } from 'react'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell flex min-h-screen flex-col">
      <header className="border-b bg-surface">
        <div className="mx-auto flex w-full max-w-[var(--content-max-width)] items-center justify-between px-4 py-3">
          <a href="/" className="font-serif text-2xl font-semibold text-ink no-underline">
            Town of Alder Pond
          </a>
          <a href="/sign-in" className="tap-target inline-flex items-center">
            Sign in
          </a>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[var(--content-max-width)] flex-1 px-4 py-6">
        {children}
      </div>
    </div>
  )
}
