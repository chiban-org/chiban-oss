import type { ReactNode } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { TownHeader } from '@/components/public/TownHeader'
import { SubmitButton } from '@/components/SubmitButton'

interface PublicHeaderProps {
  signedIn: boolean
  boardMember?: boolean
  signOutAction: (formData: FormData) => Promise<void>
}

const LINK = 'tap-target inline-flex items-center'

export function PublicHeader({ signedIn, boardMember = false, signOutAction }: PublicHeaderProps) {
  return (
    <TownHeader>
      <nav aria-label="Account" className="flex flex-wrap items-center gap-x-4">
        {signedIn ? (
          <>
            {boardMember ? (
              <a href="/board" className={LINK}>
                Board meetings
              </a>
            ) : null}
            <a href="/portal" className={LINK}>
              Your applications
            </a>
            <a href="/portal/contractor" className={LINK}>
              Contractor projects
            </a>
            <a href="/parcels" className={LINK}>
              Parcel lookup
            </a>
            <form action={signOutAction}>
              <CsrfField />
              <SubmitButton variant="link" className="px-0 text-base">
                Sign out
              </SubmitButton>
            </form>
          </>
        ) : (
          <a href="/sign-in" className={LINK}>
            Sign in
          </a>
        )}
      </nav>
    </TownHeader>
  )
}
