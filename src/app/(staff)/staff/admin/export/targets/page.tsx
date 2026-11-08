import type { Metadata } from 'next'
import { ActionForm } from '@/components/ActionForm'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { type ExportTargetView, listTargets } from '@/features/export/targets/manageTargets'
import { getTownSettings } from '@/features/town/settings'
import { DEFAULT_TIME_ZONE } from '@/features/town/timeZone'
import { formatInstantLong } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { runTargetNowAction, setTargetActiveAction } from './actions'
import { AddTarget, EditTarget, StubNote } from './TargetForms'

export const metadata: Metadata = { title: 'Export storage' }

export const dynamic = 'force-dynamic'

const KIND_LABEL = {
  local_fs: 'Folder on the server',
  s3: 'S3 bucket',
  onedrive: 'OneDrive or SharePoint',
} as const

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
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <EditTarget target={target} />
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
        action={<AddTarget />}
      />
      <p>The first copy holds everything. Files are copied once and shared between months.</p>
      <p>
        These copies hold the records as NDJSON and the original documents. The CSV files, Excel
        workbook, and PDF/A copies are in the full export on the Data export page.
      </p>
      <section aria-labelledby="your-targets">
        <h2 id="your-targets">Your targets</h2>
        {listed.value.length === 0 ? <p>No targets yet. Add one with Add a target.</p> : null}
        <ul className="list-none p-0">
          {listed.value.map((target) => (
            <TargetCard key={target.id} target={target} day={day} />
          ))}
        </ul>
      </section>
    </main>
  )
}
