import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { holdSubjects, listHolds } from '@/features/records/holds'
import { getTownSettings } from '@/features/town/settings'
import { formatInstant } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { placeHoldAction, releaseHoldAction } from '../actions'

export const dynamic = 'force-dynamic'

const TARGETS: [string, string][] = [
  ['project', 'Project'],
  ['application', 'Application'],
  ['document', 'Document'],
]
const HOLD_KIND_LABEL: Record<string, string> = {
  project: 'Project',
  application: 'Application',
  document: 'Document',
}
const DEFAULT_ZONE = 'America/New_York'

export default async function HoldsPage() {
  const ctx = await requireStaffContext()
  const holds = await listHolds(ctx.db, ctx.actor, ctx.signal)
  if (!holds.ok) {
    return (
      <main>
        <h1>Legal holds</h1>
        <p role="alert">You do not have permission to manage legal holds.</p>
      </main>
    )
  }
  const subjects = await holdSubjects(ctx.db, holds.value)
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  return (
    <main className="space-y-6">
      <h1>Legal holds</h1>
      <p>
        A hold on a project, application, or document blocks disposition of everything under it.
      </p>
      <ActionForm action={placeHoldAction} submitLabel="Place hold" variant="default">
        <SelectField label="Hold on" name="targetKind" options={TARGETS} />
        <TextField
          label="Application number, project title, or document title"
          name="targetRef"
          required
        />
        <TextField label="Reason (at least 10 characters)" name="reason" required />
      </ActionForm>
      {holds.value.length === 0 ? <p>No holds have been placed.</p> : null}
      <ul className="space-y-3">
        {holds.value.map((h) => (
          <li key={h.id} className="rounded-md border p-3">
            <p className="m-0 font-medium">{`${HOLD_KIND_LABEL[h.targetKind] ?? h.targetKind} hold on ${subjects.get(h.id) ?? h.targetId}, placed ${formatInstant(h.placedAt, zone)}`}</p>
            <p className="m-0">{h.reason}</p>
            {h.releasedAt === null ? (
              <ActionForm action={releaseHoldAction} submitLabel="Release hold">
                <input type="hidden" name="holdId" value={h.id} />
                <TextField label="Release reason (at least 10 characters)" name="reason" required />
              </ActionForm>
            ) : (
              <p className="m-0">{`Released ${formatInstant(h.releasedAt, zone)}: ${h.releaseReason ?? ''}`}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
