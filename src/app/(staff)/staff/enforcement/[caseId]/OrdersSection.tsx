import { ActionForm } from '@/components/ActionForm'
import { DueLine } from '@/components/enforcement/DueLine'
import { ServiceChecklist } from '@/components/enforcement/ServiceChecklist'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail, OrderDetail } from '@/features/enforcement/caseDetail'
import {
  MOTION_BLOCK_TEXT,
  ORDER_STATUS_LABELS,
  PROVISION_KIND_LABELS,
} from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import { draftOrderAction, issueOrderAction } from '../actions'
import { CourtForms } from './CourtForms'
import type { Can } from './can'
import { Hidden, Section } from './Section'
import { ServiceForms } from './ServiceForms'

function gateText(order: OrderDetail): string {
  if (order.gate.open) return 'The motion to enforce can be filed.'
  const reasons = order.gate.blocks.map((b) =>
    typeof b === 'string'
      ? MOTION_BLOCK_TEXT[b]
      : `The motion cannot be filed until ${formatCivilDate(b.filingLeadUntil)}, five days after filing with the clerk.`,
  )
  return `The motion to enforce cannot be filed yet. ${reasons.join(' ')}`
}

function OrderBlock({ order, detail, can }: { order: OrderDetail; detail: CaseDetail; can: Can }) {
  const { row } = order
  const issued = row.status !== 'draft'
  return (
    <article className="space-y-4 rounded-md border p-4">
      <h3 className="m-0">{`${row.number}, ${ORDER_STATUS_LABELS[row.status]}`}</h3>
      <p className="m-0">
        {`${order.rule.label} (`}
        <a href={order.rule.citation.url ?? undefined} className="text-action underline">
          {order.rule.citation.label}
        </a>
        {`). Corrective action: ${row.correctiveAction === '' ? 'not written yet' : row.correctiveAction}`}
        {row.correctiveDeadline === null ? '' : `, due ${formatCivilDate(row.correctiveDeadline)}`}
        {row.ceaseImmediately ? '. The order requires the activity to stop immediately' : ''}
        {row.issuedOn === null
          ? '.'
          : `. Issued ${formatCivilDate(row.issuedOn)}${row.issuedBy === null ? '' : ` by ${detail.names[row.issuedBy] ?? 'staff'}`}.`}{' '}
        {row.documentId === null ? null : (
          <a href={`/api/documents/${row.documentId}`} className="text-action underline">
            Open order
          </a>
        )}
      </p>
      {!issued && can.issue ? (
        <ActionForm action={issueOrderAction} submitLabel="Issue order">
          <Hidden name="orderId" value={row.id} />
          <Hidden name="expectedRowVersion" value={row.rowVersion} />
          <TextField
            label="Issue date"
            name="issuedOn"
            type="date"
            defaultValue={detail.today}
            required
          />
        </ActionForm>
      ) : null}
      {issued ? (
        <>
          <h4>Service</h4>
          <ServiceChecklist rule={order.rule} status={order.status} state={order.service} />
          {can.service ? <ServiceForms order={order} detail={detail} /> : null}
          <h4>Answer periods</h4>
          {order.answerDues.length === 0 ? (
            <p>No answer period is running. It starts when a recipient is served.</p>
          ) : null}
          {order.answerDues.map((a) => (
            <div key={a.recipientId} className="space-y-1">
              <p className="m-0 font-medium">{a.name}</p>
              <DueLine due={a.due} today={detail.today} />
              {a.answeredOn === null ? null : (
                <p className="m-0">{`Answer received ${formatCivilDate(a.answeredOn)}.`}</p>
              )}
            </div>
          ))}
          <h4>Court</h4>
          <p className="m-0 font-medium">{gateText(order)}</p>
          {order.appealDue === null ? null : (
            <div>
              <p className="m-0 font-medium">Appeal of the judgment</p>
              <DueLine due={order.appealDue} today={detail.today} />
            </div>
          )}
          {can.service ? <CourtForms order={order} detail={detail} /> : null}
        </>
      ) : null}
    </article>
  )
}

export function OrdersSection({ detail, can }: { detail: CaseDetail; can: Can }) {
  const open = detail.findings.filter((f) => f.status === 'open')
  return (
    <Section id="orders" title="Cease and desist orders">
      {detail.orders.length === 0 ? <p>No order has been drafted.</p> : null}
      {detail.orders.map((o) => (
        <OrderBlock key={o.row.id} order={o} detail={detail} can={can} />
      ))}
      {can.manage && open.length > 0 ? (
        <ActionForm action={draftOrderAction} submitLabel="Draft order">
          <Hidden name="caseId" value={detail.staff.row.id} />
          <fieldset className="space-y-1">
            <legend className="font-medium">Findings the order is based on</legend>
            {open.map((f) => (
              <label key={f.id} className="flex items-center gap-2">
                <input type="checkbox" name="findingIds" value={f.id} />
                {`${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef}`}
              </label>
            ))}
          </fieldset>
          <AreaField label="Corrective action required" name="correctiveAction" rows={3} />
          <TextField label="Corrective action due" name="correctiveDeadline" type="date" />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="ceaseImmediately" value="true" />
            The activity must stop immediately
          </label>
          <p className="m-0">
            Only an officer on record as designated by the town can issue the order.
          </p>
        </ActionForm>
      ) : null}
    </Section>
  )
}
