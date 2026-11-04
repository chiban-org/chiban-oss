import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { RunReport } from '@/components/staff/RunReport'
import { importRuns } from '@/db/schema'
import { importRunSummary, importRunTitle } from '@/features/gis/import/runText'
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
  const timeZone = await townTimeZone(ctx.db, ctx.signal)
  return (
    <main>
      <PageHeader
        kicker={<Link href="/staff/gis/imports">Imports</Link>}
        title={importRunTitle(run, timeZone)}
        lead={importRunSummary(run)}
      />
      {run.status === 'failed' ? <p role="alert">{`Error: ${run.error ?? 'Unknown'}`}</p> : null}
      {run.report === null ? null : (
        <section aria-labelledby="run-report">
          <h2 id="run-report">Run report</h2>
          <RunReport report={run.report as ImportRunReport} />
        </section>
      )}
      <p>
        <Link href="/staff/gis/exceptions">View the exception queue</Link>
      </p>
    </main>
  )
}
