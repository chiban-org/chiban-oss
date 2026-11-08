import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import type { RtkRequestView } from '@/features/rtk/requests'
import type { CivilDate } from '@/types/civilDate'
import { denyRequestAction } from '../actions'

export function DenyStep({ request, today }: { request: RtkRequestView; today: CivilDate }) {
  if (request.status !== 'awaiting_decision') return null
  const ready = request.withholdings.length > 0
  return (
    <section aria-label="Deny the request" data-slot="deny-step">
      <h3>Or deny the request</h3>
      <p className="text-ink-secondary">
        A denial cites the exemption and explains how it applies to each withheld record. It files
        the denial letter.
      </p>
      {ready ? (
        <details>
          <summary>Deny the request</summary>
          <ActionForm
            action={denyRequestAction}
            submitLabel="Deny the request"
            variant="destructive"
            confirm={{
              title: `Deny request ${request.number}?`,
              body: 'The denial letter is filed with every withheld record and its exemption.',
              confirmLabel: 'Deny the request',
              cancelLabel: 'Keep it waiting',
            }}
          >
            <input type="hidden" name="requestId" value={request.id} />
            <TextField
              label="Date of the denial"
              name="deniedOn"
              type="date"
              defaultValue={today}
              required
            />
          </ActionForm>
        </details>
      ) : (
        <p>
          Before a denial, record a withheld record with its exemption and explanation under{' '}
          <a href="#withholdings">Records withheld or redacted</a>.
        </p>
      )}
    </section>
  )
}
