import type { Metadata } from 'next'
import { ActionForm } from '@/components/ActionForm'
import { Button } from '@/components/ui/button'
import { DescriptionList } from '@/components/ui/description-list'
import { db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { peekClaim } from '@/features/contractors/claimPeek'
import { loadTownProfile } from '@/features/pdf/documentFrame'
import { portalActorOrNull } from '@/server/requirePortal'
import { claimProjectAction } from './actions'

export const metadata: Metadata = { title: 'Claim your project' }

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000
const LINK = 'tap-target inline-flex items-center'
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,100}$/

async function officeContact(signal: AbortSignal): Promise<string> {
  const profile = await loadTownProfile(db, signal)
  const ways = [profile?.phone ?? '', profile?.email ?? ''].filter((w) => w !== '')
  const office = profile?.officeName ?? 'the land use office'
  return ways.length === 0
    ? `Ask the person who sent it for a new one, or contact ${office}.`
    : `Ask the person who sent it for a new one, or contact ${office} at ${ways.join(' or ')}.`
}

async function UsedLink({ actor, signal }: { actor: Actor | null; signal: AbortSignal }) {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1>Claim your project</h1>
      <p role="alert">This link has expired or was already used.</p>
      <p>{await officeContact(signal)}</p>
      <ul className="mt-4 space-y-2">
        <li>
          {actor === null ? (
            <a href="/sign-in" className={LINK}>
              Sign in
            </a>
          ) : (
            <a href="/portal/contractor" className={LINK}>
              Your contractor projects
            </a>
          )}
        </li>
        <li>
          <a href="/" className={LINK}>
            Go to the home page
          </a>
        </li>
      </ul>
    </main>
  )
}

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const actor = await portalActorOrNull(signal)
  const preview = TOKEN_SHAPE.test(token) ? await peekClaim(db, token, signal) : null
  if (preview === null) return await UsedLink({ actor, signal })
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1>Claim your project</h1>
      <DescriptionList
        items={[
          { label: 'Project', value: preview.title },
          { label: 'Address', value: preview.siteAddress ?? 'Address not on file' },
          { label: 'Sent to', value: preview.email },
        ]}
      />
      <p className="m-0">
        {`Claiming the project lets you follow its permits and inspections in one place. Sign in with ${preview.email} to claim it.`}
      </p>
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
