import type { Metadata } from 'next'
import { ActionForm } from '@/components/ActionForm'
import { Button } from '@/components/ui/button'
import { portalActorOrNull } from '@/server/requirePortal'
import { claimProjectAction } from './actions'

export const metadata: Metadata = { title: 'Claim your project' }

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000
const LINK = 'tap-target inline-flex items-center'
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,100}$/

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const actor = await portalActorOrNull(AbortSignal.timeout(TIMEOUT_MS))
  if (!TOKEN_SHAPE.test(token)) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1>Claim your project</h1>
        <p role="alert">This link is no longer valid. Ask the person who sent it for a new one.</p>
        <ul className="mt-4 space-y-2">
          {actor === null ? (
            <li>
              <a href="/sign-in" className={LINK}>
                Sign in
              </a>
            </li>
          ) : (
            <li>
              <a href="/portal/contractor" className={LINK}>
                Your contractor projects
              </a>
            </li>
          )}
          <li>
            <a href="/" className={LINK}>
              Go to the home page
            </a>
          </li>
        </ul>
      </main>
    )
  }
  return (
    <main className="mx-auto max-w-md space-y-3 p-6">
      <h1>Claim your project</h1>
      <p>Claiming the project lets you follow its permits and inspections in one place.</p>
      {actor === null ? (
        <Button asChild size="lg" className="tap-target text-base no-underline">
          <a href={`/sign-in?next=${encodeURIComponent(`/claim/${token}`)}`}>Sign in to claim</a>
        </Button>
      ) : (
        <ActionForm action={claimProjectAction} submitLabel="Claim this project" variant="default">
          <input type="hidden" name="token" value={token} />
        </ActionForm>
      )}
    </main>
  )
}
