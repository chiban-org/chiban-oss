import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { NoPermission } from '@/components/staff/NoPermission'
import { RunReport } from '@/components/staff/RunReport'
import { importRuns } from '@/db/schema'
import { importRunSummary } from '@/features/gis/import/runText'
import type { ImportRunReport } from '@/features/gis/import/types'
import { townTimeZone } from '@/features/town/timeZone'
import { recordStaffContext } from '@/server/requireStaff'

interface RunPageProps {
  params: Promise<{ runId: string }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function StaffRunReportPage({ params }: RunPageProps) {
  const { runId } = await params
  if (!UUID.test(runId)) notFound()
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Import run" action="see layer imports" />
  const [run] = await ctx.db.select().from(importRuns).where(eq(importRuns.id, runId))
  if (run === undefined) notFound()
  return (
    <main>
      <h1>Import run</h1>
      <p>{importRunSummary(run, await townTimeZone(ctx.db, ctx.signal))}</p>
      {run.status === 'failed' ? <p role="alert">{`Error: ${run.error ?? 'Unknown'}`}</p> : null}
      {run.report === null ? null : <RunReport report={run.report as ImportRunReport} />}
      <p className="mt-4">
        <Link href="/staff/gis/exceptions" className="text-action underline">
          View the exception queue
        </Link>
      </p>
    </main>
  )
}
