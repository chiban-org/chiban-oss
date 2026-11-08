import { ActionForm } from '@/components/ActionForm'
import { SelectField } from '@/components/staff/fields'
import { isRequestOpen } from '@/features/rtk/requestStatus'
import type { RtkRequestView } from '@/features/rtk/requests'
import { closeRequestAction } from '../actions'

function Hidden({ request }: { request: RtkRequestView }) {
  return (
    <>
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="expectedRowVersion" value={String(request.rowVersion)} />
    </>
  )
}

export function CloseStepForm({ request }: { request: RtkRequestView }) {
  return (
    <ActionForm
      action={closeRequestAction}
      submitLabel="Close the request"
      variant="destructive"
      confirm={{
        title: `Close request ${request.number}?`,
        body: 'It is closed, or marked withdrawn by the requester, as chosen above. Nothing more can be released on it.',
        confirmLabel: 'Close the request',
        cancelLabel: 'Keep it open',
      }}
    >
      <Hidden request={request} />
      <SelectField
        label="Close it as"
        name="to"
        options={[
          ['closed', 'Closed'],
          ['withdrawn', 'Withdrawn by the requester'],
        ]}
      />
    </ActionForm>
  )
}

export function RequestMoreActions({ request }: { request: RtkRequestView }) {
  if (!isRequestOpen(request)) return null
  return (
    <details className="more-actions">
      <summary className="text-sm">More actions</summary>
      <div className="flex flex-col gap-3">
        <ActionForm
          action={closeRequestAction}
          submitLabel="Close the request"
          variant="destructive"
          compact
          confirm={{
            title: `Close request ${request.number}?`,
            body: 'Nothing more can be released on a closed request.',
            confirmLabel: 'Close the request',
            cancelLabel: 'Keep it open',
          }}
        >
          <Hidden request={request} />
          <input type="hidden" name="to" value="closed" />
        </ActionForm>
        <ActionForm
          action={closeRequestAction}
          submitLabel="Mark withdrawn"
          variant="outline"
          compact
          confirm={{
            title: `Mark request ${request.number} withdrawn?`,
            body: 'The requester withdrew the request. Nothing more can be released on it.',
            confirmLabel: 'Mark it withdrawn',
            cancelLabel: 'Keep it open',
          }}
        >
          <Hidden request={request} />
          <input type="hidden" name="to" value="withdrawn" />
        </ActionForm>
      </div>
    </details>
  )
}
