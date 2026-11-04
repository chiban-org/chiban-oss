import { ActionForm } from '@/components/ActionForm'
import { CsrfField } from '@/components/CsrfField'
import { TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import { listExports } from '@/features/export/requestExport'
import { currentServiceState } from '@/features/town/serviceStatus'
import { getTownSettings } from '@/features/town/settings'
import { DEFAULT_TIME_ZONE } from '@/features/town/timeZone'
import { formatCivilDate, formatInstantLong } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
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

const RECOVERY_ERROR_COPY: Record<string, string> = {
  invalid_credentials: 'Your password or authenticator code was not right. Try again.',
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  passphrase_too_short: 'The passphrase must be at least 16 characters.',
  forbidden: 'You do not have permission to download a recovery export.',
  csrf: 'Your session expired. Reload the page and try again.',
  service_inactive: 'Recovery exports are not available right now.',
}
const RECOVERY_ERROR_FALLBACK = 'The recovery export could not be prepared. Try again.'

interface ExportPageProps {
  searchParams?: Promise<{ recovery_error?: string }>
}

export default async function ExportPage({ searchParams }: ExportPageProps = {}) {
  const { recovery_error: recoveryError } = (await searchParams) ?? {}
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
  const zone = town.ok ? town.value.timeZone : DEFAULT_TIME_ZONE
  const day = (instant: Date | null) => (instant === null ? '' : formatInstantLong(instant, zone))
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
          <p className="m-0">
            {service.mode === 'active'
              ? 'Preparing an export does not interrupt anyone using Chiban.'
              : 'Nobody is using Chiban now, so preparing an export changes nothing for anyone.'}
          </p>
        </ActionForm>
      )}
      {ctx.actor.roles.includes('admin') ? (
        <p>
          <a className="text-action underline" href="/staff/admin/export/targets">
            Copy exports to your own storage every month
          </a>
        </p>
      ) : null}
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
          {recoveryError === undefined ? null : (
            <p role="alert">{RECOVERY_ERROR_COPY[recoveryError] ?? RECOVERY_ERROR_FALLBACK}</p>
          )}
          <form method="post" action="/staff/admin/export/recovery" className="max-w-md space-y-4">
            <CsrfField />
            <TextField
              id="recovery-password"
              label="Your password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
            <TextField
              id="recovery-totp"
              label="Authenticator code"
              name="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <TextField
              id="recovery-passphrase"
              label="Passphrase for the file (at least 16 characters)"
              name="passphrase"
              type="password"
              minLength={16}
              required
              autoComplete="new-password"
            />
            <Button type="submit">Download recovery export</Button>
          </form>
        </section>
      ) : null}
    </main>
  )
}
