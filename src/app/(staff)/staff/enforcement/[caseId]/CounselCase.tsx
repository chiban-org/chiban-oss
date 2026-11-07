import { RecordLayout } from '@/components/layout/RecordLayout'
import type { CaseDetail, OrderDetail } from '@/features/enforcement/caseDetail'
import { counselReferralApplies } from '@/features/enforcement/caseView'
import {
  FINDING_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PROVISION_KIND_LABELS,
} from '@/features/enforcement/labels'
import type { CasePanelKey } from '@/features/enforcement/panelPriority'
import { formatCivilDate } from '@/lib/formatDate'
import { CaseFacts, type CaseRailProps, CaseStrip } from './CaseRail'
import { CounselSection } from './CounselSection'
import { readOnlyPanels } from './casePanels'
import { fineApplies, MoneySection } from './MoneySection'
import { Section } from './Section'

const LEAD: ReadonlySet<CasePanelKey> = new Set<CasePanelKey>(['counsel', 'fines'])

function orderLine(order: OrderDetail): string {
  const { row } = order
  const action = row.correctiveAction === '' ? 'not written yet' : row.correctiveAction
  const due =
    row.correctiveDeadline === null ? '' : `, due ${formatCivilDate(row.correctiveDeadline)}`
  return `${row.number}, ${ORDER_STATUS_LABELS[row.status]}. Corrective action: ${action.replace(/\.$/, '')}${due}.`
}

function CaseSummaryPanel({ detail }: { detail: CaseDetail }) {
  const orders = detail.orders.filter((o) => o.row.status !== 'withdrawn')
  return (
    <Section id="summary" title="Case summary">
      {detail.findings.length === 0 ? <p>No violation has been found yet.</p> : null}
      <ul className="m-0 list-none p-0">
        {detail.findings.map((f) => (
          <li key={f.id} className="record-item">
            {`${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef} (${FINDING_STATUS_LABELS[f.status]})`}
          </li>
        ))}
        {orders.map((o) => (
          <li key={o.row.id} className="record-item">
            {orderLine(o)}
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function CounselCase(props: CaseRailProps) {
  const { detail, can, plan } = props
  const mayRefer = can.counsel && counselReferralApplies(plan)
  const showCounsel = mayRefer || detail.referrals.length > 0
  const showFines = detail.fines.length > 0 || (can.fine && fineApplies(detail))
  const history = readOnlyPanels(detail, can, { withService: true })
    .filter((p) => !p.empty && !LEAD.has(p.key))
    .map((p) => p.node)
  return (
    <RecordLayout
      rail={
        <div className="rail-card">
          <CaseFacts detail={detail} can={can} assignee={props.assignee} />
        </div>
      }
      strip={<CaseStrip {...props} />}
      history={history}
    >
      <CaseSummaryPanel detail={detail} />
      {showCounsel ? <CounselSection detail={detail} can={can} mayRefer={mayRefer} /> : null}
      {showFines ? <MoneySection detail={detail} can={can} /> : null}
    </RecordLayout>
  )
}
