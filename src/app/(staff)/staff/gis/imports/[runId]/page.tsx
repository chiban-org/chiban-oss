import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RunReport } from '@/components/staff/RunReport'
import { importRuns } from '@/db/schema'
import type { ImportRunReport } from '@/features/gis/import/types'
import { requireStaffContext } from '@/server/requireStaff'

interface RunPageProps {
  params: Promise<{ runId: string }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function StaffRunReportPage({ params }: RunPageProps) {
  const { runId } = await params
  if (!UUID.test(runId)) notFound()
  const ctx = await requireStaffContext()
  const [run] = await ctx.db.select().from(importRuns).where(eq(importRuns.id, runId))
  if (run === undefined) notFound()
  return (
    <main>
      <h1>Import run</h1>
      <p>{`${run.layerKey} from ${run.adapter}, started ${run.startedAt.toISOString()}. Status: ${run.status}.`}</p>
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
