import { ActionForm } from '@/components/ActionForm'
import { AddressTextField } from '@/components/address/AddressTextField'
import { SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail, OrderDetail } from '@/features/enforcement/caseDetail'
import { ROLE_CHECK_LABELS, ROLE_LABELS } from '@/features/enforcement/labels'
import { NO_HOSTED } from '@/features/enforcement/workPlanTypes'
import {
  answerAction,
  listRecipientAction,
  roleCheckAction,
  serviceEventAction,
} from '../serviceActions'
import { CaseFileUpload } from './CaseFileUpload'
import { NewestChoiceSelect } from './NewestChoiceSelect'
import { Hidden } from './Section'
import { ServiceMethodFields } from './ServiceMethodFields'
import { UploadPair } from './UploadPair'

const ROLES = Object.entries(ROLE_LABELS) as [string, string][]
const CHECKS = Object.entries(ROLE_CHECK_LABELS) as [string, string][]

type Variant = 'default' | 'outline'

interface OrderFormProps {
  order: OrderDetail
  detail: CaseDetail
  variant: Variant
}

export function AddRecipientForm({
  order,
  role,
  variant,
}: Omit<OrderFormProps, 'detail'> & { role?: string }) {
  return (
    <ActionForm action={listRecipientAction} submitLabel="Add recipient" variant={variant}>
      <Hidden name="orderId" value={order.row.id} />
      <SelectField label="Role" name="role" options={ROLES} defaultValue={role} />
      <TextField label="Name" name="name" required />
      <AddressTextField label="Address" name="address" required />
      <TextField
        label="Where the name came from, such as the CAMA owner or a registry book and page"
        name="source"
        required
      />
    </ActionForm>
  )
}

export function RoleCheckForm({
  order,
  detail,
  role,
  variant,
}: OrderFormProps & { role?: string }) {
  return (
    <ActionForm action={roleCheckAction} submitLabel="Record check" variant={variant}>
      <Hidden name="orderId" value={order.row.id} />
      <SelectField label="Role" name="role" options={ROLES} defaultValue={role} />
      <SelectField label="Result" name="outcome" options={CHECKS} />
      <TextField label="What was searched" name="basis" required />
      <TextField
        label="Date checked"
        name="checkedOn"
        type="date"
        defaultValue={detail.today}
        required
      />
    </ActionForm>
  )
}

export function RecordServiceForm({
  order,
  detail,
  recipientId,
  variant,
}: OrderFormProps & { recipientId?: string | null }) {
  const proofs = detail.documents.filter((d) => d.docKind === 'service_proof')
  const proofOptions: [string, string][] = [
    ['', 'Choose an uploaded proof'],
    ...proofs.map((d) => [d.documentId, d.title] as [string, string]),
  ]
  const recipients: [string, string][] = [
    ...order.service.recipients.map(
      (r) => [r.id, `${r.name}, ${ROLE_LABELS[r.role]}`] as [string, string],
    ),
    ['', 'No one person: posting or publication'],
  ]
  return (
    <UploadPair>
      <div className="space-y-4">
        <details>
          <summary>Upload the proof of service</summary>
          <CaseFileUpload
            caseId={detail.staff.row.id}
            kind="service_proof"
            label="Proof of service"
          />
        </details>
        <ActionForm action={serviceEventAction} submitLabel="Record service" variant={variant}>
          <Hidden name="orderId" value={order.row.id} />
          <SelectField
            label="Recipient"
            name="recipientId"
            options={recipients}
            defaultValue={recipientId === null ? '' : recipientId}
          />
          <TextField
            label="Date served"
            name="servedOn"
            type="date"
            defaultValue={detail.today}
            required
          />
          <ServiceMethodFields
            defaultMethod={recipientId === null ? 'posting_on_property' : 'in_hand'}
          />
          <NewestChoiceSelect
            label="Proof of service"
            name="proofDocumentId"
            options={proofOptions}
          />
        </ActionForm>
      </div>
    </UploadPair>
  )
}

function AnswerForm({ order, detail }: Omit<OrderFormProps, 'variant'>) {
  const answerDocs: [string, string][] = [
    ['', 'Choose an uploaded document'],
    ...detail.documents.map((d) => [d.documentId, d.title] as [string, string]),
  ]
  const answerRecipients: [string, string][] = order.service.recipients.map((r) => [r.id, r.name])
  if (answerRecipients.length === 0) return null
  return (
    <details>
      <summary className="cursor-pointer font-medium">Record an answer</summary>
      <UploadPair>
        <details>
          <summary>Upload the answer</summary>
          <CaseFileUpload
            caseId={detail.staff.row.id}
            kind="enforcement_letter"
            label="Letter or other case document"
          />
        </details>
        <ActionForm action={answerAction} submitLabel="Record answer">
          <SelectField label="Who answered" name="recipientId" options={answerRecipients} />
          <TextField
            label="Date received"
            name="answeredOn"
            type="date"
            defaultValue={detail.today}
            required
          />
          <NewestChoiceSelect label="The answer document" name="documentId" options={answerDocs} />
        </ActionForm>
      </UploadPair>
    </details>
  )
}

export function ServiceForms({
  order,
  detail,
  hosted = NO_HOSTED,
}: {
  order: OrderDetail
  detail: CaseDetail
  hosted?: ReadonlySet<string>
}) {
  const orderId = order.row.id
  return (
    <div className="space-y-4">
      {hosted.has(`list_recipient:${orderId}`) ? null : (
        <details>
          <summary className="cursor-pointer font-medium">Add a recipient</summary>
          <AddRecipientForm order={order} variant="outline" />
        </details>
      )}
      {hosted.has(`record_role_check:${orderId}`) ? null : (
        <details>
          <summary className="cursor-pointer font-medium">Record the check for a role</summary>
          <RoleCheckForm order={order} detail={detail} variant="outline" />
        </details>
      )}
      {hosted.has(`record_service:${orderId}`) ? null : (
        <details>
          <summary className="cursor-pointer font-medium">Record service</summary>
          <RecordServiceForm order={order} detail={detail} variant="outline" />
        </details>
      )}
      <AnswerForm order={order} detail={detail} />
    </div>
  )
}
