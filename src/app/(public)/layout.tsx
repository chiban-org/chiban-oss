import type { ReactNode } from 'react'
import { PublicHeader } from '@/components/public/PublicHeader'
import { getActor } from '@/server/getActor'
import { signOutPublicAction } from './account/actions'

const TIMEOUT_MS = 10_000

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const actor = await getActor(AbortSignal.timeout(TIMEOUT_MS))
  return (
    <div className="public-shell flex min-h-screen flex-col">
      <PublicHeader signedIn={actor !== null} signOutAction={signOutPublicAction} />
      <div className="mx-auto w-full max-w-[var(--content-max-width)] flex-1 px-4 py-6">
        {children}
      </div>
    </div>
  )
}
