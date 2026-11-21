import { CheckField } from '@/components/staff/fields'
import type { Role } from '@/constants/roles'
import { packStaffRoles } from '@/features/authz/classificationScope'
import { recordsLaw } from '@/features/packs/vocabulary'
import { roleLabel } from '@/features/staffNav/roleLabels'

export function roleHints(): Readonly<Partial<Record<Role, string>>> {
  return {
    admin: 'Settings, exports, and these accounts',
    staff: 'Applications, permits, boards, and enforcement',
    inspector: 'Inspections and enforcement orders',
    plumbing_inspector: 'Plumbing permits, their inspections, and enforcement orders',
    finance: 'Payments, refunds, and cash reports',
    records_custodian: `Holds, retention, and ${recordsLaw()}`,
    reviewer: 'Reviews assigned to them',
    board_member: 'Board packets and meetings',
  }
}

export function RoleChecks({
  selected,
  legendHidden = false,
}: {
  selected: readonly Role[]
  legendHidden?: boolean
}) {
  const hints = roleHints()
  return (
    <fieldset className="grid gap-3">
      <legend className={legendHidden ? 'sr-only' : 'mb-2 text-sm font-semibold'}>Roles</legend>
      {packStaffRoles().map((role) => (
        <CheckField
          key={role}
          name="roles"
          value={role}
          defaultChecked={selected.includes(role)}
          label={
            <span>
              <span className="font-semibold">{roleLabel(role)}</span>
              <span className="text-muted-foreground">{`: ${hints[role] ?? ''}`}</span>
            </span>
          }
        />
      ))}
    </fieldset>
  )
}
