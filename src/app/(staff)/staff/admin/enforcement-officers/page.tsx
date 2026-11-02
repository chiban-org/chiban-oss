import { desc, eq, inArray } from 'drizzle-orm'
import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { STAFF_ROLES } from '@/constants/roles'
import { enforcementDesignations, userRoles, users } from '@/db/schema'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { designateOfficerAction } from './actions'

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
    .where(inArray(userRoles.role, [...STAFF_ROLES]))
    .orderBy(users.displayName)
  return (
    <main className="space-y-6">
      <h1>Enforcement officers</h1>
      <p>
        A cease and desist order can be issued only by an officer the town has designated. Record
        the designation the board adopted.
      </p>
      {designations.length === 0 ? <p>No officer has been designated.</p> : null}
      <ul className="m-0 list-none space-y-2 p-0">
        {designations.map((d) => (
          <li key={d.id} className="rounded-md border p-3">
            {`${d.name}, ${d.title}. Designated by ${d.authority} on ${formatCivilDate(d.adoptedOn)}${d.endedOn === null ? '' : `, ended ${formatCivilDate(d.endedOn)}`}.`}
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
