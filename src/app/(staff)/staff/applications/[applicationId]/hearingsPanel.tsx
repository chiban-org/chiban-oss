import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { SelectField } from '@/components/staff/fields'
import type { ApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { reviewChipStatus, reviewStatusLabel } from '@/features/reviews/statusLabels'
import { formatCivilDate } from '@/lib/formatDate'
import { routeToTrcAction, scheduleHearingAction } from '../../boards/hearings/actions'

export function HearingsPanel({ data }: { data: ApplicationHearingsPanel | null }) {
  if (data === null) return null
  return (
    <section aria-label="Hearings and decisions" id="hearings" className="space-y-4">
      <h2>Hearings and decisions</h2>
      {data.hearings.length === 0 ? <p>No hearing is scheduled yet.</p> : null}
      <ul className="m-0 list-none space-y-1 p-0">
        {data.hearings.map((h) => (
          <li key={h.id}>
            <Link href={`/staff/boards/hearings/${h.id}`}>{h.text}</Link>
          </li>
        ))}
        {data.decisions.map((d) => (
          <li key={d.id}>
            <Link href={`/staff/boards/decisions/${d.id}`}>{`Decision: ${d.text}`}</Link>
          </li>
        ))}
      </ul>
      {data.canSchedule ? (
        <details>
          <summary>Schedule a hearing</summary>
          <ActionForm
            action={scheduleHearingAction}
            submitLabel="Schedule hearing"
            className="max-w-md"
          >
            <input type="hidden" name="applicationId" value={data.applicationId} />
            <SelectField
              label="Meeting"
              name="meetingId"
              options={data.scheduleMeetings.map((m): [string, string] => [m.id, m.text])}
            />
            <SelectField label="Kind" name="kind" options={data.scheduleKinds} />
          </ActionForm>
        </details>
      ) : null}
      <div className="space-y-2">
        <h3>Technical Review Committee</h3>
        {data.trc.length === 0 ? <p>No departments have been asked to review.</p> : null}
        {data.trc.length === 0 ? null : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col">Department</th>
                <th scope="col">Reviewer</th>
                <th scope="col">Status</th>
                <th scope="col">Comments due</th>
              </tr>
            </thead>
            <tbody>
              {data.trc.map((d) => (
                <tr key={d.departmentKey}>
                  <td>{d.departmentLabel}</td>
                  <td>{d.reviewerName}</td>
                  <td>
                    <StatusChip
                      status={reviewChipStatus(d.status, d.overdue)}
                      label={
                        d.overdue
                          ? `${reviewStatusLabel(d.status)}, overdue`
                          : reviewStatusLabel(d.status)
                      }
                    />
                  </td>
                  <td>{d.commentDue === null ? 'Not set' : formatCivilDate(d.commentDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data.canRoute ? (
          <ActionForm action={routeToTrcAction} submitLabel="Send to review departments">
            <input type="hidden" name="applicationId" value={data.applicationId} />
          </ActionForm>
        ) : null}
      </div>
    </section>
  )
}
