import { CheckField } from '@/components/staff/fields'
import { type Role, STAFF_ROLES } from '@/constants/roles'
import { roleLabel } from '@/features/staffNav/roleLabels'

const ROLE_HINT: Readonly<Partial<Record<Role, string>>> = {
  admin: 'Settings, exports, and these accounts',
  staff: 'Applications, permits, boards, and enforcement',
  inspector: 'Inspections and enforcement orders',
  finance: 'Payments, refunds, and cash reports',
  records_custodian: 'Holds, retention, and Right-to-Know',
  reviewer: 'Reviews assigned to them',
  board_member: 'Board packets and meetings',
}

export function RoleChecks({
  selected,
  legendHidden = false,
}: {
  selected: readonly Role[]
  legendHidden?: boolean
}) {
  return (
    <fieldset className="grid gap-3">
      <legend className={legendHidden ? 'sr-only' : 'mb-2 text-sm font-semibold'}>Roles</legend>
      {STAFF_ROLES.map((role) => (
        <CheckField
          key={role}
          name="roles"
          value={role}
          defaultChecked={selected.includes(role)}
          label={
            <span>
              <span className="font-semibold">{roleLabel(role)}</span>
              <span className="text-muted-foreground">{`: ${ROLE_HINT[role] ?? ''}`}</span>
            </span>
          }
        />
      ))}
    </fieldset>
  )
}
