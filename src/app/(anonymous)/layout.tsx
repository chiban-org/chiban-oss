import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@fontsource-variable/mulish'
import '@fontsource-variable/source-serif-4'
import '../globals.css'
import { DemoBanner } from '@/components/DemoBanner'
import { CONTENT_ID, SkipLink } from '@/components/public/SkipLink'
import { TownFooter } from '@/components/public/TownFooter'
import { TownHeader } from '@/components/public/TownHeader'
import { db } from '@/db/client'
import { loadPublicTown, townWithoutAssetRequests } from '@/features/town/publicTown'

const TIMEOUT_MS = 10_000

export async function generateMetadata(): Promise<Metadata> {
  const town = await loadPublicTown(db, AbortSignal.timeout(TIMEOUT_MS))
  return {
    title: { default: town.name, template: `%s · ${town.name}` },
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
    icons: { icon: 'data:,' },
  }
}

export default async function AnonymousLayout({ children }: { children: ReactNode }) {
  const town = await loadPublicTown(db, AbortSignal.timeout(TIMEOUT_MS))
  return (
    <html lang="en">
      <body>
        <DemoBanner />
        <div className="public-shell flex min-h-screen flex-col">
          <SkipLink />
          <TownHeader town={townWithoutAssetRequests(town)} />
          <main
            id={CONTENT_ID}
            tabIndex={-1}
            className="mx-auto w-full max-w-[var(--content-max-width)] flex-1 px-4 py-6 focus:outline-none"
          >
            {children}
          </main>
          <TownFooter town={town} />
        </div>
      </body>
    </html>
  )
}
