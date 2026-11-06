import type { Metadata } from 'next'
import { applyStarterPathsAction } from '@/app/(staff)/staff/settings/actions'
import { ActionForm } from '@/components/ActionForm'
import { StarterDiffReview } from '@/components/config/StarterDiffReview'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { requireCapability } from '@/features/authz/capabilities'
import { loadStarterReviews } from '@/features/config/starterReview'
import { requireStaffContext } from '@/server/requireStaff'

export const metadata: Metadata = { title: 'Starter updates' }

export const dynamic = 'force-dynamic'

export default async function StarterUpdatesPage() {
  const ctx = await requireStaffContext()
  const allowed = await requireCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal)
  if (!allowed.ok) return <NoPermission title="Starter updates" action="change the configuration" />
  const bundles = await loadStarterReviews(ctx.db, ctx.signal)
  return (
    <main>
      <SettingsHeader
        title="Starter updates"
        lead="Adopted starters with a newer upstream version. Tick the changes you want to take; everything left unticked stays as your town has it."
        back={{ href: '/staff/settings/starters', label: 'Starter templates' }}
      />
      {bundles.length === 0 ? <p>Every adopted starter is up to date.</p> : null}
      {bundles.map((bundle) => (
        <section key={bundle.starterId}>
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
