import Link from 'next/link'
import { applyStarterPathsAction } from '@/app/(staff)/staff/settings/actions'
import { ActionForm } from '@/components/ActionForm'
import { StarterDiffReview } from '@/components/config/StarterDiffReview'
import { requireCapability } from '@/features/authz/capabilities'
import { loadStarterReviews } from '@/features/config/starterReview'
import { requireStaffContext } from '@/server/requireStaff'

export const dynamic = 'force-dynamic'

export default async function StarterUpdatesPage() {
  const ctx = await requireStaffContext()
  const allowed = await requireCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal)
  if (!allowed.ok) {
    return (
      <main>
        <h1>Starter updates</h1>
        <p role="alert">You do not have permission to change the configuration.</p>
      </main>
    )
  }
  const bundles = await loadStarterReviews(ctx.db, ctx.signal)
  return (
    <main>
      <p>
        <Link href="/staff/settings" className="text-action underline">
          Settings
        </Link>
      </p>
      <h1>Starter updates</h1>
      <p className="text-muted-foreground">
        These starters you adopted have a newer upstream version. Tick the changes you want to take.
        Everything you leave unticked stays as your town has it.
      </p>
      {bundles.length === 0 ? <p>Every adopted starter is up to date.</p> : null}
      {bundles.map((bundle) => (
        <section key={bundle.starterId} className="my-6">
          <h2>{`${bundle.label}, upstream version ${bundle.upstreamVersion}`}</h2>
          <ActionForm
            action={applyStarterPathsAction}
            submitLabel="Apply selected"
            variant="default"
          >
            <StarterDiffReview members={bundle.members} />
          </ActionForm>
        </section>
      ))}
    </main>
  )
}
