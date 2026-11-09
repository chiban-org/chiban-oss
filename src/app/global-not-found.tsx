import type { Metadata } from 'next'
import '@fontsource-variable/mulish'
import '@fontsource-variable/source-serif-4'
import { NotFoundPage } from '@/components/NotFoundPage'
import { TownFooter } from '@/components/public/TownFooter'
import { TownHeader } from '@/components/public/TownHeader'
import { db } from '@/db/client'
import { loadPublicTown, townWithoutAssetRequests } from '@/features/town/publicTown'
import './globals.css'

export const metadata: Metadata = { title: 'Page not found' }

const TIMEOUT_MS = 10_000

export default async function GlobalNotFound() {
  const town = await loadPublicTown(db, AbortSignal.timeout(TIMEOUT_MS))
  return (
    <html lang="en">
      <body>
        <div className="public-shell">
          <TownHeader town={townWithoutAssetRequests(town)} />
        </div>
        <NotFoundPage />
        <div className="public-shell">
          <TownFooter town={town} />
        </div>
      </body>
    </html>
  )
}
