import { CsrfField } from '@/components/CsrfField'
import { TownHeader } from '@/components/public/TownHeader'
import { SubmitButton } from '@/components/SubmitButton'
import { accountLinksFor, type NavViewer } from '@/features/publicSite/publicNav'
import type { PublicTown } from '@/features/town/publicTown'

interface PublicHeaderProps {
  town: PublicTown
  viewer: NavViewer | null
  signOutAction: (formData: FormData) => Promise<void>
}

export function PublicHeader({ town, viewer, signOutAction }: PublicHeaderProps) {
  return (
    <TownHeader
      town={town}
      account={{
        links: accountLinksFor(viewer),
        signOut:
          viewer === null ? undefined : (
            <form action={signOutAction}>
              <CsrfField />
              <SubmitButton
                variant="link"
                className="min-h-11 justify-start px-2 text-base font-semibold text-ink-secondary"
              >
                Sign out
              </SubmitButton>
            </form>
          ),
      }}
    />
  )
}
