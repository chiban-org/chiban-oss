import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { SectionHeader } from '@/components/layout/ListHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadRostersView } from '@/features/rosters/rosterView'
import { requireStaffContext } from '@/server/requireStaff'
import { recordReviewAction } from './actions'
import { AddAssociation, AddHolder, AddPark } from './RosterForms'
import { AssociationTable, ParkTable, RestrictionTable } from './RosterTables'

export const dynamic = 'force-dynamic'

export default async function RostersPage() {
  const ctx = await requireStaffContext()
  const view = await loadRostersView(ctx.db, ctx.actor, ctx.signal)
  if (view === null) return <NoPermission title="Rosters" action="keep the abutter rosters" />
  return (
    <main data-wide="">
      <h1>Rosters</h1>
      <p>
        These lists are kept by the town and feed every abutter list. Review each one on a schedule
        so the lists drawn from them can be trusted.
      </p>
      <section aria-label="Review status" className="space-y-3">
        <h2>When each roster was last reviewed</h2>
        {view.kinds.map((k) => (
          <div key={k.kind} className="flex flex-wrap items-end gap-4 border-b pb-3">
            <div className="min-w-72 flex-1">
              <p className="m-0 font-medium">{k.label}</p>
              <p className="m-0">{k.statusText}</p>
            </div>
            <ActionForm action={recordReviewAction} submitLabel="Record a review today">
              <input type="hidden" name="kind" value={k.kind} />
              <input type="hidden" name="reviewedOn" value={view.today} />
            </ActionForm>
          </div>
        ))}
      </section>
      <section aria-labelledby="associations" className="space-y-3">
        <SectionHeader
          id="associations"
          title="Condominium associations"
          action={<AddAssociation today={view.today} />}
        />
        {view.associations.length === 0 ? (
          <p>No association rosters yet. Add the first one with Add association.</p>
        ) : (
          <AssociationTable rows={view.associations} today={view.today} />
        )}
      </section>
      <section aria-labelledby="parks" className="space-y-3">
        <SectionHeader
          id="parks"
          title="Manufactured housing parks"
          action={<AddPark today={view.today} />}
        />
        {view.parks.length === 0 ? (
          <p>No park rosters yet. Add the first one with Add park.</p>
        ) : (
          <ParkTable rows={view.parks} today={view.today} />
        )}
      </section>
      <section aria-labelledby="holders" className="space-y-3">
        <SectionHeader
          id="holders"
          title="Easement and restriction holders"
          action={<AddHolder />}
        />
        {view.restrictions.length === 0 ? (
          <p>No holders yet. Add the first one with Add holder.</p>
        ) : (
          <RestrictionTable rows={view.restrictions} today={view.today} />
        )}
      </section>
      <section aria-label="Regional notice contacts" className="space-y-3">
        <h2>Regional notice contacts</h2>
        <dl className="space-y-2">
          {view.regionalContacts.map((c) => (
            <div key={c.role}>
              <dt className="font-medium">{c.role}</dt>
              <dd className="m-0">{c.lines.length === 0 ? 'None on file' : c.lines.join('; ')}</dd>
            </div>
          ))}
        </dl>
        <p>
          {'An administrator changes these in Settings. '}
          {view.canEditRegionalContacts ? (
            <Link href="/staff/settings/regional_contacts">
              Change the regional notice contacts
            </Link>
          ) : null}
        </p>
      </section>
    </main>
  )
}
