import { ActionForm } from '@/components/ActionForm'
import { DueLine } from '@/components/enforcement/DueLine'
import { ServiceChecklist } from '@/components/enforcement/ServiceChecklist'
import { NEW_TAB } from '@/components/newTab'
import { AreaField, CheckField, SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail, OrderDetail } from '@/features/enforcement/caseDetail'
import { motionGateText } from '@/features/enforcement/gateText'
import {
  MOTION_BLOCK_TEXT,
  ORDER_STATUS_LABELS,
  PROVISION_KIND_LABELS,
} from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import {
  discardDraftOrderAction,
  draftOrderAction,
  issueOrderAction,
  reviseDraftOrderAction,
} from '../actions'
import { CourtForms } from './CourtForms'
import type { Can } from './can'
import { Hidden, Section } from './Section'
import { ServiceForms } from './ServiceForms'

function motionFiledOn(order: OrderDetail): CivilDate | null {
  const step = order.steps.find((s) => s.kind === 'motion_to_enforce')
  return (step?.occurredOn ?? null) as CivilDate | null
}

function OrderSummary({ order, detail }: { order: OrderDetail; detail: CaseDetail }) {
  const { row } = order
  return (
    <p>
      {`${order.rule.label} (`}
      <a href={order.rule.citation.url ?? undefined}>{order.rule.citation.label}</a>
      {`). Corrective action: ${row.correctiveAction === '' ? 'not written yet' : row.correctiveAction.replace(/\.$/, '')}`}
      {row.correctiveDeadline === null ? '' : `, due ${formatCivilDate(row.correctiveDeadline)}`}
      {row.ceaseImmediately ? '. The order requires the activity to stop immediately' : ''}
      {row.issuedOn === null
        ? '.'
        : `. Issued ${formatCivilDate(row.issuedOn)}${row.issuedBy === null ? '' : ` by ${detail.names[row.issuedBy] ?? 'staff'}`}.`}{' '}
      {row.documentId === null ? null : (
        <a {...NEW_TAB} href={`/api/documents/${row.documentId}`}>
          Open order
        </a>
      )}
    </p>
  )
}

function DraftForms({ order }: { order: OrderDetail }) {
  const { row } = order
  return (
    <>
      <ActionForm action={reviseDraftOrderAction} submitLabel="Save the draft">
        <Hidden name="orderId" value={row.id} />
        <Hidden name="expectedRowVersion" value={row.rowVersion} />
        <AreaField
          label="Corrective action required"
          name="correctiveAction"
          rows={3}
          defaultValue={row.correctiveAction}
        />
        <TextField
          label="Corrective action due"
          name="correctiveDeadline"
          type="date"
          defaultValue={row.correctiveDeadline ?? ''}
        />
        <CheckField
          label="The activity must stop immediately"
          name="ceaseImmediately"
          value="true"
          defaultChecked={row.ceaseImmediately}
        />
      </ActionForm>
      <ActionForm
        action={discardDraftOrderAction}
        submitLabel="Discard the draft"
        confirm={{
          title: 'Discard this draft order?',
          body: 'The draft is discarded. Its order number stays on record as discarded.',
          confirmLabel: 'Discard the draft',
        }}
      >
        <Hidden name="orderId" value={row.id} />
        <Hidden name="expectedRowVersion" value={row.rowVersion} />
      </ActionForm>
    </>
  )
}

function OrderBlock({ order, detail, can }: { order: OrderDetail; detail: CaseDetail; can: Can }) {
  const { row } = order
  const issued = row.issuedOn !== null
  return (
    <article className="record-item space-y-4">
      <h3>{`${row.number}, ${ORDER_STATUS_LABELS[row.status]}`}</h3>
      <OrderSummary order={order} detail={detail} />
      {row.status === 'draft' && can.manage ? <DraftForms order={order} /> : null}
      {row.status === 'draft' && can.issue ? (
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
              <p className="font-medium">{a.name}</p>
              <DueLine due={a.due} today={detail.today} met={a.answeredOn !== null} />
              {a.answeredOn === null ? null : (
                <p>{`Answer received ${formatCivilDate(a.answeredOn)}.`}</p>
              )}
            </div>
          ))}
          <h4>Court</h4>
          <p className="font-medium">{motionGateText(order.gate, motionFiledOn(order))}</p>
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
        <details>
          <summary>Draft an order</summary>
          <ActionForm action={draftOrderAction} submitLabel="Draft order">
            <Hidden name="caseId" value={detail.staff.row.id} />
            <fieldset className="space-y-2">
              <legend className="font-medium">Findings the order is based on</legend>
              {open.map((f) => (
                <CheckField
                  key={f.id}
                  label={`${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef}`}
                  name="findingIds"
                  value={f.id}
                />
              ))}
            </fieldset>
            <AreaField label="Corrective action required" name="correctiveAction" rows={3} />
            <TextField
              label="Corrective action due"
              name="correctiveDeadline"
              type="date"
              required
            />
            <CheckField
              label="The activity must stop immediately"
              name="ceaseImmediately"
              value="true"
            />
            <p className="m-0">
              Only an officer on record as designated by the town can issue the order.
            </p>
          </ActionForm>
        </details>
      ) : null}
    </Section>
  )
}
