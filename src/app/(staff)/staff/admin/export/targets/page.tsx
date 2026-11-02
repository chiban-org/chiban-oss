import { ActionForm } from '@/components/ActionForm'
import { type ExportTargetView, listTargets } from '@/features/export/targets/manageTargets'
import { ONEDRIVE_STUB_NOTE } from '@/features/export/targets/oneDrive'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { todayInTimeZone } from '@/types/civilDate'
import { runTargetNowAction, saveTargetAction, setTargetActiveAction } from './actions'
import { TargetFields } from './TargetFields'

export const dynamic = 'force-dynamic'

const KIND_LABEL = {
  local_fs: 'Folder on the server',
  s3: 'S3 bucket',
  onedrive: 'OneDrive or SharePoint',
} as const

function StubNote() {
  return (
    <div role="note" className="rounded-md border border-dashed p-3 text-sm">
      {ONEDRIVE_STUB_NOTE}
    </div>
  )
}

function TargetCard({
  target,
  day,
}: {
  target: ExportTargetView
  day: (d: Date | null) => string
}) {
  return (
    <li className="rounded-md border p-3">
      <h3 className="m-0">{target.name}</h3>
      <p className="m-0">
        {KIND_LABEL[target.kind]}. Copies on day {target.dayOfMonth} of each month.{' '}
        {target.isActive ? 'On.' : 'Off.'}
      </p>
      {target.kind === 'onedrive' ? <StubNote /> : null}
      {target.lastSuccessAt === null ? null : (
        <p className="m-0">Last copied {day(target.lastSuccessAt)}.</p>
      )}
      {target.lastFailureAt === null ? null : (
        <p className="m-0" role="alert">
          Last failed {day(target.lastFailureAt)}: {target.lastError ?? 'unknown error'}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        {target.isActive ? (
          <ActionForm action={runTargetNowAction} submitLabel="Run now">
            <input type="hidden" name="id" value={target.id} />
          </ActionForm>
        ) : null}
        <ActionForm
          action={setTargetActiveAction}
          submitLabel={target.isActive ? 'Turn off' : 'Turn on'}
        >
          <input type="hidden" name="id" value={target.id} />
          <input type="hidden" name="active" value={target.isActive ? 'false' : 'true'} />
        </ActionForm>
      </div>
      <details className="mt-3">
        <summary>Change this target</summary>
        <ActionForm action={saveTargetAction} submitLabel="Save changes" variant="default">
          <TargetFields kind={target.kind} idPrefix={`edit-${target.id}`} current={target} />
        </ActionForm>
      </details>
    </li>
  )
}

export default async function ExportTargetsPage() {
  const ctx = await requireStaffContext()
  const listed = await listTargets(ctx.db, ctx.actor, ctx.signal)
  if (!listed.ok) {
    return (
      <main>
        <h1>Copy exports to your own storage</h1>
        <p role="alert">You do not have permission to change export targets.</p>
      </main>
    )
  }
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : 'UTC'
  const day = (instant: Date | null) =>
    instant === null ? '' : formatCivilDate(todayInTimeZone(zone, instant))
  return (
    <main>
      <h1>Copy exports to your own storage</h1>
      <p>
        Each month Chiban copies only what changed since the last copy to storage the town controls.
        The first copy holds everything. Files are copied once and shared between months.
      </p>
      <h2>Your targets</h2>
      {listed.value.length === 0 ? <p>No targets yet.</p> : null}
      <ul className="m-0 list-none space-y-3 p-0">
        {listed.value.map((target) => (
          <TargetCard key={target.id} target={target} day={day} />
        ))}
      </ul>
      <h2>Add a target</h2>
      <section aria-labelledby="add-local">
        <h3 id="add-local">Add a local folder</h3>
        <ActionForm action={saveTargetAction} submitLabel="Add the folder" variant="default">
          <TargetFields kind="local_fs" idPrefix="add-local" />
        </ActionForm>
      </section>
      <section aria-labelledby="add-s3">
        <h3 id="add-s3">Add an S3 bucket</h3>
        <ActionForm action={saveTargetAction} submitLabel="Add the bucket" variant="default">
          <TargetFields kind="s3" idPrefix="add-s3" />
        </ActionForm>
      </section>
      <section aria-labelledby="add-onedrive">
        <h3 id="add-onedrive">Add a OneDrive or SharePoint drive</h3>
        <StubNote />
        <ActionForm action={saveTargetAction} submitLabel="Add the drive" variant="default">
          <TargetFields kind="onedrive" idPrefix="add-onedrive" />
        </ActionForm>
      </section>
    </main>
  )
}
