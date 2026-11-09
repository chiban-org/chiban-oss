import type { Metadata } from 'next'
import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { intakeOpen } from '@/features/anonymousIntake/enablement'
import { ACTION_FILES_LIMIT_MB } from '@/lib/uploadLimits'
import { AnonymousReportForm } from './AnonymousReportForm'
import { MAX_DESCRIPTION_CHARS, MAX_PHOTOS } from './limits'

export const metadata: Metadata = { title: 'Report a possible violation anonymously' }

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000

const ERRORS: Record<string, string> = {
  invalid: `Your report was not sent. Fill in where the property is and what you saw (up to ${MAX_DESCRIPTION_CHARS.toLocaleString('en-US')} characters), and attach no more than ${MAX_PHOTOS} JPEG or PNG photos, ${ACTION_FILES_LIMIT_MB} MB in all.`,
}

function errorText(code: string | string[] | undefined): string | null {
  return typeof code === 'string' && Object.hasOwn(ERRORS, code) ? (ERRORS[code] ?? null) : null
}

export default async function ReportAnonymouslyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const [{ error }, open] = await Promise.all([
    searchParams,
    intakeOpen(db, env.CHIBAN_IMAGE_REF ?? null, APP_VERSION, AbortSignal.timeout(TIMEOUT_MS)),
  ])
  if (!open) {
    return (
      <>
        <h1>Anonymous reports are not available</h1>
        <p className="max-w-prose text-base">
          This town is not taking anonymous reports right now. You can report a possible violation
          with your contact details, which only town staff see, on the{' '}
          <a href="/complaints/new">report a possible violation</a> page.
        </p>
      </>
    )
  }
  const problem = errorText(error)
  return (
    <>
      <h1>Report a possible violation anonymously</h1>
      {problem === null ? null : (
        <p role="alert" className="max-w-prose font-semibold text-status-failed-fg">
          {problem}
        </p>
      )}
      <AnonymousReportForm />
    </>
  )
}
