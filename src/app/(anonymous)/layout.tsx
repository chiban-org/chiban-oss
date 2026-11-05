import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@fontsource-variable/mulish'
import '@fontsource-variable/source-serif-4'
import '../globals.css'
import { TownHeader } from '@/components/public/TownHeader'

export const metadata: Metadata = {
  title: 'Report a possible violation',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  icons: { icon: 'data:,' },
}

export default function AnonymousLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="public-shell flex min-h-screen flex-col">
          <TownHeader />
          <main className="mx-auto w-full max-w-[var(--content-max-width)] flex-1 px-4 py-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
