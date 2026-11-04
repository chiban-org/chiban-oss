import { ActionForm } from '@/components/ActionForm'
import type { UserDetail } from '@/features/users/userDetail'
import { setRolesAction } from '../actions'
import { RoleChecks } from '../RoleChecks'

export function RolesPanel({ detail }: { detail: UserDetail }) {
  return (
    <section aria-labelledby="roles">
      <h2 id="roles">Roles</h2>
      <p className="text-muted-foreground">
        {detail.soleAdmin
          ? 'This is the only active administrator, so the Administrator role stays until someone else has it.'
          : 'Roles decide which pages and actions this person sees.'}
      </p>
      <ActionForm action={setRolesAction} submitLabel="Save roles" className="max-w-xl">
        <input type="hidden" name="userId" value={detail.id} />
        <RoleChecks selected={detail.roles} legendHidden />
      </ActionForm>
    </section>
  )
}
