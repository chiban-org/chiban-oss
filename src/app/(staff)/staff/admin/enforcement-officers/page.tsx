import type { Metadata } from 'next'
import { ActionForm } from '@/components/ActionForm'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { designationCandidates, listDesignations } from '@/features/enforcement/officerList'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { endDesignationAction } from './actions'
import { DesignateOfficer, EditDesignation } from './OfficerForms'

export const metadata: Metadata = { title: 'Enforcement officers' }

export const dynamic = 'force-dynamic'

export default async function EnforcementOfficersPage() {
  const ctx = await requireStaffContext()
  if (
    !mayOpen(
      '/staff/admin/enforcement-officers',
      await loadNavViewer(ctx.db, ctx.actor, ctx.signal),
    )
  ) {
    return <NoPermission title="Enforcement officers" action="designate enforcement officers" />
  }
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const [designations, staff] = await Promise.all([
    listDesignations(ctx.db),
    designationCandidates(ctx.db),
  ])
  return (
    <main>
      <SettingsHeader
        title="Enforcement officers"
        lead="Who may issue a cease and desist order. Record each designation the board adopts."
        action={<DesignateOfficer staff={staff} today={today} />}
      />
      <section aria-labelledby="officers">
        <h2 id="officers">Designated officers</h2>
        {designations.length === 0 ? (
          <p>No officer has been designated. Add one with Designate an officer.</p>
        ) : null}
        <ul className="list-none space-y-3 p-0">
          {designations.map((d) => (
            <li key={d.id} className="record-item space-y-2">
              <p>
                {`${d.name}, ${d.title}. Designated by ${d.authority} on ${formatCivilDate(d.adoptedOn)}${d.endedOn === null ? '' : `, ended ${formatCivilDate(d.endedOn)}`}.`}
              </p>
              <EditDesignation row={d} today={today} />
              {d.endedOn === null ? (
                <ActionForm
                  action={endDesignationAction}
                  submitLabel="End this designation"
                  confirm={{
                    title: `End ${d.name}'s designation?`,
                    body: `${d.name} is no longer a designated enforcement officer after the last day you entered.`,
                    confirmLabel: 'End the designation',
                  }}
                >
                  <input type="hidden" name="designationId" value={d.id} />
                  <TextField
                    label="Last day as officer"
                    name="endedOn"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
