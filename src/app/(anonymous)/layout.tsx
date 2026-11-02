import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@fontsource-variable/mulish'
import '@fontsource-variable/source-serif-4'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Report a possible violation',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function AnonymousLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="public-shell mx-auto flex min-h-screen max-w-[var(--content-max-width)] flex-col px-4 py-6">
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  )
}
