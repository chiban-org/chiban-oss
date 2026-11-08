import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { StageStrip } from '@/components/layout/StageStrip'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { recordExists } from '@/features/access/recordExists'
import { honestText } from '@/features/honest/honest'
import {
  type InspectionRecord,
  loadInspectionRecord,
} from '@/features/inspections/inspectionRecord'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { InspectionRail, InspectionStrip, OwedLine } from './InspectionRail'
import { ChecklistPreview, InspectionDoThisNow, PhotosPanel, ResultPanel } from './InspectionWork'

export const metadata: Metadata = { title: 'Inspection' }

export const dynamic = 'force-dynamic'

const STATUS = {
  requested: { chip: 'neutral', label: 'Requested' },
  scheduled: { chip: 'neutral', label: 'Scheduled' },
  passed: { chip: 'passed', label: 'Passed' },
  failed: { chip: 'failed', label: 'Failed' },
  cancelled: { chip: 'neutral', label: 'Cancelled' },
} as const

function Summary({ record }: { record: InspectionRecord }) {
  return (
    <div className="flex flex-col gap-3">
      <p data-slot="status-sentence" className="max-w-[75ch]">
        {record.plan.sentence}
      </p>
      <OwedLine owed={record.plan.owed} />
      <StageStrip stages={record.plan.stages} />
    </div>
  )
}

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ inspectionId: string }>
}) {
  const { inspectionId } = await params
  const ctx = await requireStaffContext()
  if (!isUuid(inspectionId)) notFound()
  const loaded = await loadInspectionRecord(ctx.db, ctx.actor, inspectionId, ctx.signal)
  if (!loaded.ok) {
    if (await recordExists(ctx.db, 'inspection', inspectionId, ctx.signal)) {
      return <NoPermission title="Inspection" action="see this inspection" />
    }
    notFound()
  }
  const record = loaded.value
  const { view } = record
  const status = STATUS[view.inspection.status]
  return (
    <main className="public-shell">
      <PageHeader
        kicker={
          <Link href={`/staff/applications/${view.inspection.applicationId}`}>
            {view.applicationNumber}
          </Link>
        }
        title={view.name}
        status={<StatusChip status={status.chip} label={status.label} />}
        lead={honestText(view.siteAddress, 'Address not on file')}
        summary={<Summary record={record} />}
      />
      <RecordLayout
        rail={<InspectionRail record={record} />}
        strip={<InspectionStrip record={record} />}
      >
        <InspectionDoThisNow record={record} />
        <ChecklistPreview record={record} />
        <ResultPanel record={record} />
        <PhotosPanel record={record} />
      </RecordLayout>
    </main>
  )
}
