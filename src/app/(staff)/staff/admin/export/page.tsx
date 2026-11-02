import { ActionForm } from '@/components/ActionForm'
import { CsrfField } from '@/components/CsrfField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { listExports } from '@/features/export/requestExport'
import { currentServiceState } from '@/features/town/serviceStatus'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { todayInTimeZone } from '@/types/civilDate'
import { requestExportAction } from './actions'

export const dynamic = 'force-dynamic'

const STATUS_COPY = {
  queued: 'Waiting to start',
  running: 'Being prepared',
  ready: 'Ready',
  failed: 'Failed',
  expired: 'Expired',
} as const

function megabytes(bytes: number | null): string {
  return bytes === null ? '' : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function ExportPage() {
  const ctx = await requireStaffContext()
  const listed = await listExports(ctx.db, ctx.actor, ctx.signal)
  if (!listed.ok) {
    return (
      <main>
        <h1>Export your records</h1>
        <p role="alert">You do not have permission to export records.</p>
      </main>
    )
  }
  const [town, service] = await Promise.all([
    getTownSettings(ctx.db, ctx.signal),
    currentServiceState(ctx.db, new Date(), ctx.signal),
  ])
  const zone = town.ok ? town.value.timeZone : 'UTC'
  const day = (instant: Date | null) =>
    instant === null ? '' : formatCivilDate(todayInTimeZone(zone, instant))
  return (
    <main>
      <h1>Export your records</h1>
      <p>
        The export is one file with every record the town keeps in Chiban and every stored document,
        in open formats. It is written from a single consistent snapshot. Each file stays available
        for 7 days after it is ready.
      </p>
      {service.mode === 'export_only' && service.exportUntil !== null ? (
        <p role="status">
          This service is no longer active. Records can be exported from this page until{' '}
          {formatCivilDate(service.exportUntil)}.
        </p>
      ) : null}
      {service.mode === 'closed' ? (
        <p role="alert">The export window has ended. Contact the operator to arrange a copy.</p>
      ) : (
        <ActionForm
          action={requestExportAction}
          submitLabel="Request a new export"
          variant="default"
        >
          <p className="m-0">Preparing an export does not interrupt anyone using Chiban.</p>
        </ActionForm>
      )}
      <h2>Your exports</h2>
      {listed.value.length === 0 ? <p>No exports have been requested yet.</p> : null}
      <ul className="m-0 list-none space-y-3 p-0">
        {listed.value.map((row) => (
          <li key={row.id} className="rounded-md border p-3">
            <p className="m-0 font-medium">
              Requested {day(row.requestedAt)}: {STATUS_COPY[row.status]}
            </p>
            {row.status === 'ready' && service.mode !== 'closed' ? (
              <p className="m-0">
                <a
                  className="text-action underline"
                  href={`/staff/admin/export/${row.id}/download`}
                >
                  Download {megabytes(row.sizeBytes)}
                </a>{' '}
                (available through {day(row.expiresAt)})
              </p>
            ) : null}
            {row.status === 'failed' ? (
              <p className="m-0">It did not finish. Request another.</p>
            ) : null}
          </li>
        ))}
      </ul>
      {ctx.actor.roles.includes('admin') && service.mode !== 'closed' ? (
        <section aria-labelledby="recovery-heading">
          <h2 id="recovery-heading">Recovery export</h2>
          <p>
            The recovery export holds the whole database and the keys that unlock the saved secrets.
            It is encrypted with a passphrase you choose, goes straight to your computer, and is not
            kept anywhere else. Keep the passphrase safe: without it the file cannot be opened.
          </p>
          <form method="post" action="/staff/admin/export/recovery" className="max-w-md space-y-3">
            <CsrfField />
            <div>
              <Label htmlFor="recovery-password">Your password</Label>
              <Input
                id="recovery-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label htmlFor="recovery-totp">Authenticator code</Label>
              <Input
                id="recovery-totp"
                name="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>
            <div>
              <Label htmlFor="recovery-passphrase">
                Passphrase for the file (at least 16 characters)
              </Label>
              <Input
                id="recovery-passphrase"
                name="passphrase"
                type="password"
                minLength={16}
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit">Download recovery export</Button>
          </form>
        </section>
      ) : null}
    </main>
  )
}
