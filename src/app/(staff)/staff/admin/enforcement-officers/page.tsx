import { and, desc, eq } from 'drizzle-orm'
import { ActionForm } from '@/components/ActionForm'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { enforcementDesignations, roleCapabilities, userRoles, users } from '@/db/schema'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { designateOfficerAction, endDesignationAction } from './actions'

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
  const designations = await ctx.db
    .select({
      id: enforcementDesignations.id,
      name: users.displayName,
      title: enforcementDesignations.title,
      authority: enforcementDesignations.adoptingAuthority,
      adoptedOn: enforcementDesignations.adoptedOn,
      endedOn: enforcementDesignations.endedOn,
    })
    .from(enforcementDesignations)
    .innerJoin(users, eq(users.id, enforcementDesignations.userId))
    .orderBy(desc(enforcementDesignations.adoptedOn))
  const staff = await ctx.db
    .selectDistinct({ id: users.id, name: users.displayName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(
      roleCapabilities,
      and(
        eq(roleCapabilities.role, userRoles.role),
        eq(roleCapabilities.capability, 'enforcement.issue_order'),
      ),
    )
    .where(eq(users.isActive, true))
    .orderBy(users.displayName)
  return (
    <main className="space-y-6">
      <SettingsHeader
        title="Enforcement officers"
        lead="Who may issue a cease and desist order. Record each designation the board adopts."
      />
      {designations.length === 0 ? <p>No officer has been designated.</p> : null}
      <ul className="m-0 list-none space-y-2 p-0">
        {designations.map((d) => (
          <li key={d.id} className="space-y-2 rounded-md border p-3">
            <p className="m-0">
              {`${d.name}, ${d.title}. Designated by ${d.authority} on ${formatCivilDate(d.adoptedOn)}${d.endedOn === null ? '' : `, ended ${formatCivilDate(d.endedOn)}`}.`}
            </p>
            {d.endedOn === null ? (
              <ActionForm action={endDesignationAction} submitLabel="End this designation">
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
      <ActionForm action={designateOfficerAction} submitLabel="Designate officer" variant="default">
        <SelectField
          label="Officer"
          name="userId"
          options={staff.map((s) => [s.id, s.name] as [string, string])}
        />
        <TextField label="Title" name="title" defaultValue="Code Enforcement Officer" required />
        <TextField
          label="Designated by"
          name="adoptingAuthority"
          defaultValue="Select Board"
          required
        />
        <TextField
          label="Date adopted"
          name="adoptedOn"
          type="date"
          defaultValue={today}
          required
        />
      </ActionForm>
    </main>
  )
}
