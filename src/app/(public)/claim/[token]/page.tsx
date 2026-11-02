import { ActionForm } from '@/components/ActionForm'
import { portalActorOrNull } from '@/server/requirePortal'
import { claimProjectAction } from './actions'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000
const LINK = 'tap-target inline-flex items-center text-action underline'
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
        <a
          href={`/sign-in?next=${encodeURIComponent(`/claim/${token}`)}`}
          className="tap-target inline-flex items-center rounded-md bg-primary px-5 py-2 text-primary-foreground"
        >
          Sign in to claim
        </a>
      ) : (
        <ActionForm action={claimProjectAction} submitLabel="Claim this project" variant="default">
          <input type="hidden" name="token" value={token} />
        </ActionForm>
      )}
    </main>
  )
}
