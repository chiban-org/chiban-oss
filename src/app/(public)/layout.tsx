import type { ReactNode } from 'react'
import { PublicHeader } from '@/components/public/PublicHeader'
import { ServiceNotice } from '@/components/ServiceNotice'
import { db } from '@/db/client'
import { currentServiceState } from '@/features/town/serviceStatus'
import { getActor } from '@/server/getActor'
import { signOutPublicAction } from './account/actions'

const TIMEOUT_MS = 10_000

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const actor = await getActor(signal)
  const service = await currentServiceState(db, new Date(), signal)
  return (
    <div className="public-shell flex min-h-screen flex-col">
      <PublicHeader signedIn={actor !== null} signOutAction={signOutPublicAction} />
      <ServiceNotice mode={service.mode} exportUntil={service.exportUntil} />
      <div className="mx-auto w-full max-w-[var(--content-max-width)] flex-1 px-4 py-6">
        {children}
      </div>
    </div>
  )
}
