import { desc, eq } from 'drizzle-orm'
import { ActionForm } from '@/components/ActionForm'
import { NoPermission } from '@/components/staff/NoPermission'
import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import { anonymousIntakeVerifications, townSettings } from '@/db/schema'
import { intakeOpen, verifiedFor } from '@/features/anonymousIntake/enablement'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { getTownSettings } from '@/features/town/settings'
import { formatInstantLong } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { disableAnonymousIntakeAction, enableAnonymousIntakeAction } from './actions'

export const dynamic = 'force-dynamic'

const LOCATION_LABELS: Record<string, string> = {
  database: 'In the database',
  logs: 'In a log',
  object_metadata: 'In the stored photo labels',
  object_bytes: 'Inside a stored photo',
  backup_database: 'In the backup of the database',
  backup_objects: 'In the backup of stored files',
  backup_missing: 'No backup was found to check',
}

const MARKER_LABELS: Record<string, string> = {
  clientIp: 'the sender address',
  userAgent: 'the browser name',
  filename: 'the original file name',
  exifArtist: 'the photo author',
  sessionUserId: 'the signed-in account',
  sessionEmail: 'the signed-in email',
}

interface Finding {
  location: string
  marker: string | null
}

export default async function AnonymousIntakePage() {
  const ctx = await requireStaffContext()
  if (
    !mayOpen('/staff/admin/anonymous-intake', await loadNavViewer(ctx.db, ctx.actor, ctx.signal))
  ) {
    return <NoPermission title="Anonymous intake" action="manage anonymous intake" />
  }
  const imageRef = env.CHIBAN_IMAGE_REF ?? null
  const [latest] = await ctx.db
    .select()
    .from(anonymousIntakeVerifications)
    .orderBy(desc(anonymousIntakeVerifications.ranAt))
    .limit(1)
  const [settings] = await ctx.db.select().from(townSettings).where(eq(townSettings.id, 1))
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : 'America/New_York'
  const verified = await verifiedFor(ctx.db, imageRef, APP_VERSION)
  const open = await intakeOpen(ctx.db, imageRef, APP_VERSION, ctx.signal)
  const findings = (latest?.findings ?? []) as Finding[]
  return (
    <main className="space-y-6">
      <h1>Anonymous intake</h1>
      <p>
        {open
          ? 'Anonymous complaints are being accepted at the report anonymously page.'
          : 'Anonymous complaints are not being accepted. The page answers as not found.'}
      </p>
      <p>
        {verified
          ? 'The version running now has a passing retention check.'
          : 'The version running now has no passing retention check, so intake cannot be turned on. Run the check on the server host: verify-anonymous-intake.sh with the folder that holds the nightly backups.'}
      </p>
      <section aria-labelledby="last-check" className="space-y-2">
        <h2 id="last-check">Last retention check</h2>
        {latest === undefined ? (
          <p>No retention check has been recorded.</p>
        ) : (
          <>
            <p className="m-0">{`${latest.passed ? 'Passed' : 'Failed'} on ${formatInstantLong(latest.ranAt, zone)}.`}</p>
            <p className="m-0">{`Version checked: ${latest.imageRef ?? `release ${latest.appVersion}`}.`}</p>
            {findings.length === 0 ? null : (
              <ul className="m-0 space-y-1">
                {findings.map((f) => (
                  <li key={`${f.location}-${f.marker ?? 'none'}`}>
                    {`${LOCATION_LABELS[f.location] ?? 'Somewhere'}${f.marker === null ? '' : `: ${MARKER_LABELS[f.marker] ?? 'identifying data'} was found`}.`}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      {settings?.anonymousIntakeEnabled === true ? (
        <ActionForm
          action={disableAnonymousIntakeAction}
          submitLabel="Turn anonymous intake off"
          variant="default"
        >
          <p className="m-0">Turning it off takes effect immediately.</p>
        </ActionForm>
      ) : (
        <ActionForm
          action={enableAnonymousIntakeAction}
          submitLabel="Turn anonymous intake on"
          variant="default"
        >
          <p className="m-0">
            Turning it on needs a passing retention check for the running version.
          </p>
        </ActionForm>
      )}
    </main>
  )
}
