import { ActionForm } from '@/components/ActionForm'
import { DueLine } from '@/components/enforcement/DueLine'
import { NextStep } from '@/components/layout/NextStep'
import { FactList } from '@/components/layout/PageHeader'
import { SelectField } from '@/components/staff/fields'
import { RTK_VIA_LABELS } from '@/features/rtk/labels'
import { isRequestOpen, requestNextStep } from '@/features/rtk/requestStatus'
import type { RtkRequestView } from '@/features/rtk/requests'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { closeRequestAction } from '../actions'

function CloseForm({ request }: { request: RtkRequestView }) {
  return (
    <details>
      <summary>Close the request</summary>
      <ActionForm action={closeRequestAction} submitLabel="Close request">
        <input type="hidden" name="requestId" value={request.id} />
        <input type="hidden" name="expectedRowVersion" value={String(request.rowVersion)} />
        <SelectField
          label="Close it as"
          name="to"
          options={[
            ['closed', 'Closed'],
            ['withdrawn', 'Withdrawn by the requester'],
          ]}
        />
      </ActionForm>
    </details>
  )
}

function requestFacts(request: RtkRequestView) {
  return [
    {
      label: 'Received',
      value: `${formatCivilDate(request.receivedOn)}, ${RTK_VIA_LABELS[request.receivedVia].toLowerCase()}`,
    },
    ...(request.requesterName === null
      ? []
      : [{ label: 'Requester', value: request.requesterName }]),
    ...(request.requesterContact === null
      ? []
      : [{ label: 'Contact', value: request.requesterContact }]),
  ]
}

export function RequestRail({
  request,
  today,
  canManage,
}: {
  request: RtkRequestView
  today: CivilDate
  canManage: boolean
}) {
  const working = canManage && isRequestOpen(request)
  const next = canManage ? requestNextStep(request) : null
  const ended = !isRequestOpen(request)
  return (
    <>
      {next === null && !working ? null : (
        <div className="rail-card">
          {next === null ? null : (
            <NextStep>
              <p>{next}</p>
            </NextStep>
          )}
          {working ? <CloseForm request={request} /> : null}
        </div>
      )}
      <div className="rail-card">
        <h2 className="font-sans text-sm font-semibold text-muted-foreground">Response deadline</h2>
        <DueLine due={request.responseDue} today={today} met={request.firstResponseOn !== null} />
        {request.statedDue === null ? null : (
          <>
            <h3 className="font-sans text-sm font-semibold text-muted-foreground">
              Date the town stated
            </h3>
            <DueLine due={request.statedDue} today={today} met={ended} />
          </>
        )}
      </div>
      <div className="rail-card">
        <FactList facts={requestFacts(request)} stacked />
      </div>
    </>
  )
}
