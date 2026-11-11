import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { SeePublicLink } from '@/components/SeePublicLink'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { assigneeChoices, caseAssignee } from '@/features/enforcement/caseAssignment'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { type CaseView, caseViewFor } from '@/features/enforcement/caseView'
import { caseChipStatus } from '@/features/enforcement/chipStatus'
import { attachableComplaints } from '@/features/enforcement/complaintCandidates'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import { loadFindingSuggestions } from '@/features/enforcement/sections/suggestionInputs'
import { planCaseWork } from '@/features/enforcement/workPlan'
import { hostedActions } from '@/features/enforcement/workPlanTypes'
import { loadCasePayments } from '@/features/payments/casePayments'
import { casePublicHref } from '@/features/publicSite/publicHref'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { CaseRail, type CaseRailProps, CaseStrip } from './CaseRail'
import { CaseDoThisNow, CaseRequirements, CaseSummary } from './CaseWork'
import { CounselCase } from './CounselCase'
import { loadCan } from './can'
import { arrangeCasePanels, casePanels } from './casePanels'
import { FieldCase } from './FieldCase'
import { caseAbilities } from './planAbilities'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ caseId: string }>
}): Promise<Metadata> {
  const { caseId } = await params
  const ctx = await requireStaffContext()
  const viewer = await loadNavViewer(ctx.db, ctx.actor, ctx.signal)
  if (!mayOpen('/staff/enforcement', viewer) || !isUuid(caseId)) return { title: 'Case' }
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const loaded = await loadCaseDetail(ctx.db, ctx.actor, caseId, today, ctx.signal)
  return { title: loaded.ok ? `Case ${loaded.value.staff.row.number}` : 'Case' }
}

function OfficeCase(props: CaseRailProps) {
  const { detail, can, plan } = props
  const sections = arrangeCasePanels(
    detail,
    casePanels({ detail, can, hosted: hostedActions(plan) }),
  )
  return (
    <RecordLayout
      rail={<CaseRail {...props} />}
      strip={<CaseStrip {...props} />}
      empty={sections.empty}
      history={sections.history}
    >
      <CaseDoThisNow detail={detail} plan={plan} />
      <CaseRequirements plan={plan} />
      {sections.filled}
    </RecordLayout>
  )
}

function CaseBody({ view, props }: { view: CaseView; props: CaseRailProps }) {
  switch (view) {
    case 'field':
      return <FieldCase {...props} />
    case 'counsel':
      return <CounselCase {...props} />
    case 'office':
      return <OfficeCase {...props} />
  }
}

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const ctx = await requireStaffContext()
  if (!mayOpen('/staff/enforcement', await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Code enforcement" action="see code enforcement cases" />
  }
  if (!isUuid(caseId)) notFound()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const loaded = await loadCaseDetail(ctx.db, ctx.actor, caseId, today, ctx.signal)
  if (!loaded.ok) notFound()
  const [can, current, payments] = await Promise.all([
    loadCan(ctx.db, ctx.actor, ctx.signal),
    caseAssignee(ctx.db, caseId),
    loadCasePayments(
      ctx.db,
      ctx.actor,
      loaded.value.fines.map((f) => f.row.id),
      ctx.signal,
    ),
  ])
  const detail = can.manage
    ? {
        ...loaded.value,
        payments,
        suggestions: await loadFindingSuggestions(
          ctx.db,
          { parcelId: loaded.value.staff.row.parcelId, today },
          ctx.signal,
        ),
        attachable: await attachableComplaints(ctx.db, {
          caseId,
          parcelId: loaded.value.staff.row.parcelId,
        }),
      }
    : { ...loaded.value, payments }
  const assignee = { current, choices: can.manage ? await assigneeChoices(ctx.db) : [] }
  const { row } = detail.staff
  const plan = planCaseWork(detail, {
    abilities: caseAbilities(can),
    responsible: assignee.current?.name ?? null,
  })
  const view = caseViewFor({
    roles: ctx.actor.roles,
    manages: can.manage,
    recordsService: can.service,
    refersCounsel: can.counsel,
    assigned: current?.userId === ctx.actor.userId,
  })
  return (
    <main>
      <PageHeader
        kicker="Code enforcement case"
        title={row.number}
        status={
          <StatusChip status={caseChipStatus(row.status)} label={CASE_STATUS_LABELS[row.status]} />
        }
        lead={row.locationText}
        summary={<CaseSummary detail={detail} plan={plan} />}
        actions={<SeePublicLink href={casePublicHref(row)} />}
      />
      <CaseBody view={view} props={{ detail, can, assignee, plan }} />
    </main>
  )
}
