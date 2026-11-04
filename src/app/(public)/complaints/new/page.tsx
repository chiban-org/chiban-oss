import Link from 'next/link'
import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { intakeOpen } from '@/features/anonymousIntake/enablement'
import { ComplaintForm } from './ComplaintForm'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000

export default async function NewComplaintPage() {
  const anonymous = await intakeOpen(
    db,
    env.CHIBAN_IMAGE_REF ?? null,
    APP_VERSION,
    AbortSignal.timeout(TIMEOUT_MS),
  )
  return (
    <main className="space-y-4">
      <h1>Report a possible violation</h1>
      <p className="max-w-prose">
        Tell the town about a possible zoning or building code violation. Town staff review every
        report.
      </p>
      <ComplaintForm />
      {anonymous ? (
        <p className="max-w-prose">
          Prefer not to give your name? <Link href="/report-anonymously">Report anonymously</Link>.
        </p>
      ) : null}
    </main>
  )
}
