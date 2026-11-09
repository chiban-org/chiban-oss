import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SiteRoot, townSiteMetadata } from '@/app/siteRoot'
import { PublicHeader } from '@/components/public/PublicHeader'
import { CONTENT_ID, SkipLink } from '@/components/public/SkipLink'
import { TownFooter } from '@/components/public/TownFooter'
import { ServiceNotice } from '@/components/ServiceNotice'
import { db } from '@/db/client'
import { loadPublicTown } from '@/features/town/publicTown'
import { currentServiceState } from '@/features/town/serviceStatus'
import { getActor } from '@/server/getActor'
import { signOutPublicAction } from './account/actions'

const TIMEOUT_MS = 10_000

export async function generateMetadata(): Promise<Metadata> {
  const town = await loadPublicTown(db, AbortSignal.timeout(TIMEOUT_MS))
  return townSiteMetadata(town.name)
}

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const [actor, service, town] = await Promise.all([
    getActor(signal),
    currentServiceState(db, new Date(), signal),
    loadPublicTown(db, signal),
  ])
  return (
    <SiteRoot>
      <div className="public-shell flex min-h-screen flex-col">
        <SkipLink />
        <PublicHeader town={town} viewer={actor} signOutAction={signOutPublicAction} />
        <ServiceNotice mode={service.mode} exportUntil={service.exportUntil} />
        <div
          id={CONTENT_ID}
          tabIndex={-1}
          className="mx-auto w-full max-w-[var(--content-max-width)] flex-1 px-4 py-6 focus:outline-none"
        >
          {children}
        </div>
        <TownFooter town={town} />
      </div>
    </SiteRoot>
  )
}
