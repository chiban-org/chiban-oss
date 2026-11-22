import { recordsRequest } from '@/features/packs/vocabulary'
import type { PortalRecordsRequest } from '@/features/portal/recordsRequests'
import { formatCivilDate } from '@/lib/formatDate'

function statusLine(request: PortalRecordsRequest): string {
  if (request.endedOn !== null) return `${request.status} on ${formatCivilDate(request.endedOn)}.`
  if (request.responseDueOn === null) return `${request.status}.`
  return `${request.status}. Response due ${formatCivilDate(request.responseDueOn)}.`
}

export function RecordsRequestsSection({ requests }: { requests: PortalRecordsRequest[] }) {
  if (requests.length === 0) return null
  return (
    <section aria-labelledby="records-requests-heading">
      <h2 id="records-requests-heading">{`Your ${recordsRequest()}s`}</h2>
      <ul className="list-none divide-y p-0">
        {requests.map((request) => (
          <li key={request.number} className="flex flex-col gap-0.5 py-3">
            <span className="font-semibold">{request.number}</span>
            <span>{`Received ${formatCivilDate(request.receivedOn)}.`}</span>
            <span>{statusLine(request)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
