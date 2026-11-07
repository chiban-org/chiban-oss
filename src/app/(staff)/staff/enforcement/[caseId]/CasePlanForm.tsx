import type { CaseDetail } from '@/features/enforcement/caseDetail'
import type { CaseAction } from '@/features/enforcement/workPlanTypes'
import { CloseForm, MoveForm } from './CaseStatusForm'
import { CourtStepForm } from './CourtForms'
import { ReceiptForm, RecordFindingForm, SendNoticeForm } from './FindingsSection'
import { FinePaymentForm } from './MoneySection'
import { DraftOrderForm, IssueOrderForm } from './OrdersSection'
import { AddRecipientForm, RecordServiceForm, RoleCheckForm } from './ServiceForms'

const variant = 'default'

function orderOf(detail: CaseDetail, orderId: string) {
  return detail.orders.find((o) => o.row.id === orderId) ?? null
}

function OrderActionForm({
  action,
  detail,
}: {
  action: Extract<CaseAction, { orderId: string }>
  detail: CaseDetail
}) {
  const order = orderOf(detail, action.orderId)
  if (order === null) return null
  switch (action.kind) {
    case 'issue_order':
      return <IssueOrderForm order={order} detail={detail} variant={variant} />
    case 'record_role_check':
      return <RoleCheckForm order={order} detail={detail} role={action.role} variant={variant} />
    case 'list_recipient':
      return <AddRecipientForm order={order} role={action.role} variant={variant} />
    case 'record_service':
      return (
        <RecordServiceForm
          order={order}
          detail={detail}
          recipientId={action.recipientId}
          variant={variant}
        />
      )
    case 'record_court_step':
      return <CourtStepForm order={order} detail={detail} step={action.step} variant={variant} />
  }
}

export function CasePlanForm({ action, detail }: { action: CaseAction; detail: CaseDetail }) {
  switch (action.kind) {
    case 'move':
      return action.to === 'closed' ? (
        <CloseForm detail={detail} />
      ) : (
        <MoveForm detail={detail} to={action.to} variant={variant} />
      )
    case 'record_finding':
      return <RecordFindingForm detail={detail} variant={variant} />
    case 'send_notice':
      return <SendNoticeForm detail={detail} variant={variant} />
    case 'record_notice_receipt':
      return <ReceiptForm detail={detail} noticeId={action.noticeId} variant={variant} />
    case 'draft_order':
      return <DraftOrderForm detail={detail} variant={variant} />
    case 'record_fine_payment':
      return <FinePaymentForm fineId={action.fineId} variant={variant} />
    case 'issue_order':
    case 'record_role_check':
    case 'list_recipient':
    case 'record_service':
    case 'record_court_step':
      return <OrderActionForm action={action} detail={detail} />
  }
}
