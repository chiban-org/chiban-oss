import { ActionForm } from '@/components/ActionForm'
import { PracticeNotice } from '@/components/PracticeNotice'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { type ExportTargetView, listTargets } from '@/features/export/targets/manageTargets'
import { ONEDRIVE_STUB_NOTE } from '@/features/export/targets/oneDrive'
import { getTownSettings } from '@/features/town/settings'
import { DEFAULT_TIME_ZONE } from '@/features/town/timeZone'
import { formatInstantLong } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { runTargetNowAction, saveTargetAction, setTargetActiveAction } from './actions'
import { TargetFields } from './TargetFields'

export const dynamic = 'force-dynamic'

const KIND_LABEL = {
  local_fs: 'Folder on the server',
  s3: 'S3 bucket',
  onedrive: 'OneDrive or SharePoint',
} as const

function StubNote() {
  return <PracticeNotice>{ONEDRIVE_STUB_NOTE}</PracticeNotice>
}

function TargetCard({
  target,
  day,
}: {
  target: ExportTargetView
  day: (d: Date | null) => string
}) {
  return (
    <li className="record-item">
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
          confirm={
            target.isActive
              ? {
                  title: 'Turn off this export target?',
                  body: 'Monthly copies stop going to it until you turn it on again.',
                  confirmLabel: 'Turn it off',
                }
              : undefined
          }
        >
          <input type="hidden" name="id" value={target.id} />
          <input type="hidden" name="active" value={target.isActive ? 'false' : 'true'} />
        </ActionForm>
      </div>
      <details className="mt-3">
        <summary>Change this target</summary>
        <ActionForm action={saveTargetAction} submitLabel="Save changes">
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
    return <NoPermission title="Copy exports to your own storage" action="change export targets" />
  }
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : DEFAULT_TIME_ZONE
  const day = (instant: Date | null) => (instant === null ? '' : formatInstantLong(instant, zone))
  return (
    <main>
      <SettingsHeader
        title="Copy exports to your own storage"
        lead="Each month Chiban copies what changed since the last copy to storage the town controls."
        back={{ href: '/staff/admin/export', label: 'Data export' }}
      />
      <p>The first copy holds everything. Files are copied once and shared between months.</p>
      <section aria-labelledby="your-targets">
        <h2 id="your-targets">Your targets</h2>
        {listed.value.length === 0 ? <p>No targets yet.</p> : null}
        <ul className="m-0 list-none p-0">
          {listed.value.map((target) => (
            <TargetCard key={target.id} target={target} day={day} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="add-target">
        <h2 id="add-target">Add a target</h2>
        <details>
          <summary>Add a local folder</summary>
          <ActionForm action={saveTargetAction} submitLabel="Add the folder">
            <TargetFields kind="local_fs" idPrefix="add-local" />
          </ActionForm>
        </details>
        <details>
          <summary>Add an S3 bucket</summary>
          <ActionForm action={saveTargetAction} submitLabel="Add the bucket">
            <TargetFields kind="s3" idPrefix="add-s3" />
          </ActionForm>
        </details>
        <details>
          <summary>Add a OneDrive or SharePoint drive</summary>
          <StubNote />
          <ActionForm action={saveTargetAction} submitLabel="Add the drive">
            <TargetFields kind="onedrive" idPrefix="add-onedrive" />
          </ActionForm>
        </details>
      </section>
    </main>
  )
}
