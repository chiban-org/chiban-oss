import { RecordLayout } from '@/components/layout/RecordLayout'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { ORDER_STATUS_LABELS } from '@/features/enforcement/labels'
import { hostedActions } from '@/features/enforcement/workPlanTypes'
import { CaseFileUpload } from './CaseFileUpload'
import { type CaseRailProps, FactsAndActions } from './CaseRail'
import { CaseDoThisNow } from './CaseWork'
import type { Can } from './can'
import { arrangeCasePanels, readOnlyPanels } from './casePanels'
import { AddNoteForm } from './FindingsSection'
import { OrderService } from './OrdersSection'
import { Section } from './Section'

function QuickActions({ detail, can }: { detail: CaseDetail; can: Can }) {
  if (!can.manage && !can.service) return null
  return (
    <section aria-label="Quick actions" data-plain className="flex flex-col gap-3">
      <details className="rail-card">
        <summary>Add a photo</summary>
        <CaseFileUpload
          caseId={detail.staff.row.id}
          kind="enforcement_photo"
          label="Photo of the property"
          capture="environment"
        />
      </details>
      {can.manage ? (
        <details className="rail-card">
          <summary>Add a note</summary>
          <AddNoteForm detail={detail} />
        </details>
      ) : null}
    </section>
  )
}

function FieldService({ props, hosted }: { props: CaseRailProps; hosted: ReadonlySet<string> }) {
  const { detail, can } = props
  const issued = detail.orders.filter(
    (o) => o.row.issuedOn !== null && o.row.status !== 'withdrawn',
  )
  if (issued.length === 0) return null
  return (
    <Section id="service" title="Service">
      {issued.map((order) => (
        <article key={order.row.id} className="record-item space-y-3">
          <h3>{`${order.row.number}, ${ORDER_STATUS_LABELS[order.row.status]}`}</h3>
          <OrderService order={order} detail={detail} can={can} hosted={hosted} />
        </article>
      ))}
    </Section>
  )
}

function FieldFacts(props: CaseRailProps) {
  return (
    <details data-case-facts="" className="record-history">
      <summary>Case facts and more actions</summary>
      <section aria-label="Case facts" data-plain>
        <FactsAndActions {...props} />
      </section>
    </details>
  )
}

export function FieldCase(props: CaseRailProps) {
  const { detail, can, plan } = props
  const hosted = hostedActions(plan)
  const history = arrangeCasePanels(detail, readOnlyPanels(detail, can, { withService: false }))
  return (
    <RecordLayout>
      <CaseDoThisNow detail={detail} plan={plan} />
      <QuickActions detail={detail} can={can} />
      <FieldService props={props} hosted={hosted} />
      {history.filled}
      {history.history}
      <FieldFacts {...props} />
    </RecordLayout>
  )
}
