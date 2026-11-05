import type { ReactNode } from 'react'
import { SITE_METADATA, SiteRoot } from '@/app/siteRoot'
import { PublicHeader } from '@/components/public/PublicHeader'
import { ServiceNotice } from '@/components/ServiceNotice'
import { db } from '@/db/client'
import { isBoardMember } from '@/features/access/predicates'
import { currentServiceState } from '@/features/town/serviceStatus'
import { getActor } from '@/server/getActor'
import { signOutPublicAction } from './account/actions'

const TIMEOUT_MS = 10_000

export const metadata = SITE_METADATA

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const actor = await getActor(signal)
  const service = await currentServiceState(db, new Date(), signal)
  return (
    <SiteRoot>
      <div className="public-shell flex min-h-screen flex-col">
        <PublicHeader
          signedIn={actor !== null}
          boardMember={actor !== null && isBoardMember(actor)}
          signOutAction={signOutPublicAction}
        />
        <ServiceNotice mode={service.mode} exportUntil={service.exportUntil} />
        <div className="mx-auto w-full max-w-[var(--content-max-width)] flex-1 px-4 py-6">
          {children}
        </div>
      </div>
    </SiteRoot>
  )
}
