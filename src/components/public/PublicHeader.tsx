import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'

interface PublicHeaderProps {
  signedIn: boolean
  signOutAction: (formData: FormData) => Promise<void>
}

const LINK = 'tap-target inline-flex items-center'

export function PublicHeader({ signedIn, signOutAction }: PublicHeaderProps) {
  return (
    <header className="border-b bg-surface">
      <div className="mx-auto flex w-full max-w-[var(--content-max-width)] flex-wrap items-center justify-between gap-x-6 px-4 py-3">
        <a href="/" className="font-serif text-2xl font-semibold text-ink no-underline">
          Town of Alder Pond
        </a>
        <nav aria-label="Account" className="flex items-center gap-4">
          {signedIn ? (
            <>
              <a href="/account" className={LINK}>
                Your applications
              </a>
              <form action={signOutAction}>
                <CsrfField />
                <SubmitButton className="tap-target text-action underline">Sign out</SubmitButton>
              </form>
            </>
          ) : (
            <a href="/sign-in" className={LINK}>
              Sign in
            </a>
          )}
        </nav>
      </div>
    </header>
  )
}
