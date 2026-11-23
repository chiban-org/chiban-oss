import { ActionForm } from '@/components/ActionForm'
import { SelectField } from '@/components/staff/fields'
import { VALIDITY_LABELS, type VarianceValidity } from '@/features/decisions/recordingRequired'
import type { RelianceView } from '@/features/decisions/relianceView'
import { linkRelianceAction, unlinkRelianceAction } from './relianceActions'

interface Props {
  applicationId: string
  validity: VarianceValidity
  reliance: RelianceView | null
  canLink: boolean
}

export function reliancePanelApplies(validity: VarianceValidity, reliance: RelianceView | null) {
  return validity !== 'not_required' || reliance !== null
}

export function ReliancePanel({ applicationId, validity, reliance, canLink }: Props) {
  return (
    <section aria-label="Variance" id="variance">
      <h2>Variance</h2>
      {validity === 'not_required' ? null : <p>{VALIDITY_LABELS[validity]}</p>}
      {reliance === null ? null : (
        <>
          {reliance.linked.length === 0 ? (
            <p>This application does not rely on a variance.</p>
          ) : (
            <ul className="list-none space-y-2 p-0">
              {reliance.linked.map((l) => (
                <li key={l.id} className="record-item">
                  <p className="m-0 font-medium">{`Relies on ${l.number}`}</p>
                  <p className="m-0">{VALIDITY_LABELS[l.validity]}</p>
                  {canLink ? (
                    <ActionForm
                      action={unlinkRelianceAction}
                      submitLabel="Remove this link"
                      variant="outline"
                      confirm={{
                        title: `Remove the link to ${l.number}?`,
                        body: 'This application will no longer wait on that variance before it can be issued.',
                        confirmLabel: 'Remove the link',
                      }}
                    >
                      <input type="hidden" name="applicationId" value={applicationId} />
                      <input type="hidden" name="varianceApplicationId" value={l.id} />
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canLink && reliance.choices.length > 0 ? (
            <details>
              <summary>Relies on a variance</summary>
              <ActionForm action={linkRelianceAction} submitLabel="Link variance">
                <input type="hidden" name="applicationId" value={applicationId} />
                <SelectField
                  label="Variance"
                  name="varianceApplicationId"
                  required
                  options={reliance.choices.map((c) => [c.id, c.number] as const)}
                />
              </ActionForm>
            </details>
          ) : null}
        </>
      )}
    </section>
  )
}
