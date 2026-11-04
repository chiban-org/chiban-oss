import { ActionForm } from '@/components/ActionForm'
import { AddressTextField } from '@/components/address/AddressTextField'
import { SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail, OrderDetail } from '@/features/enforcement/caseDetail'
import {
  ROLE_CHECK_LABELS,
  ROLE_LABELS,
  SERVER_ROLE_LABELS,
  SERVICE_METHOD_LABELS,
} from '@/features/enforcement/labels'
import {
  answerAction,
  listRecipientAction,
  roleCheckAction,
  serviceEventAction,
} from '../serviceActions'
import { Hidden } from './Section'

const ROLES = Object.entries(ROLE_LABELS) as [string, string][]
const CHECKS = Object.entries(ROLE_CHECK_LABELS) as [string, string][]
const METHODS = Object.entries(SERVICE_METHOD_LABELS) as [string, string][]
const SERVERS: [string, string][] = [
  ['', 'Not applicable'],
  ...(Object.entries(SERVER_ROLE_LABELS) as [string, string][]),
]

export function ServiceForms({ order, detail }: { order: OrderDetail; detail: CaseDetail }) {
  const orderId = order.row.id
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
  const answerDocs: [string, string][] = detail.documents.map((d) => [d.documentId, d.title])
  const answerRecipients: [string, string][] = order.service.recipients.map((r) => [r.id, r.name])
  return (
    <div className="space-y-4">
      <details>
        <summary className="cursor-pointer font-medium">Add a recipient</summary>
        <ActionForm action={listRecipientAction} submitLabel="Add recipient">
          <Hidden name="orderId" value={orderId} />
          <SelectField label="Role" name="role" options={ROLES} />
          <TextField label="Name" name="name" required />
          <AddressTextField label="Address" name="address" required />
          <TextField
            label="Where the name came from, such as the CAMA owner or a registry book and page"
            name="source"
            required
          />
        </ActionForm>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">Record the check for a role</summary>
        <ActionForm action={roleCheckAction} submitLabel="Record check">
          <Hidden name="orderId" value={orderId} />
          <SelectField label="Role" name="role" options={ROLES} />
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
      </details>
      <details>
        <summary className="cursor-pointer font-medium">Record service</summary>
        <p className="m-0">Upload the proof on the Documents section first, as proof of service.</p>
        <ActionForm action={serviceEventAction} submitLabel="Record service">
          <Hidden name="orderId" value={orderId} />
          <SelectField label="Recipient" name="recipientId" options={recipients} />
          <SelectField label="Method" name="method" options={METHODS} />
          <TextField
            label="Date served"
            name="servedOn"
            type="date"
            defaultValue={detail.today}
            required
          />
          <TextField label="Served by (name)" name="serverName" />
          <SelectField label="Server is a" name="serverRole" options={SERVERS} />
          <TextField label="Newspaper (for publication)" name="newspaper" />
          <SelectField label="Proof of service" name="proofDocumentId" options={proofOptions} />
        </ActionForm>
      </details>
      {answerRecipients.length === 0 ? null : (
        <details>
          <summary className="cursor-pointer font-medium">Record an answer</summary>
          <ActionForm action={answerAction} submitLabel="Record answer">
            <SelectField label="Who answered" name="recipientId" options={answerRecipients} />
            <TextField
              label="Date received"
              name="answeredOn"
              type="date"
              defaultValue={detail.today}
              required
            />
            <SelectField label="The answer document" name="documentId" options={answerDocs} />
          </ActionForm>
        </details>
      )}
    </div>
  )
}
