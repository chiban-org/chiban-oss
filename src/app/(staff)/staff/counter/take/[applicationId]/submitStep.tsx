import Link from 'next/link'
import { submitIntakeAction } from '@/app/(staff)/staff/counter/intakeActions'
import { ActionForm } from '@/components/ActionForm'
import { CheckField } from '@/components/staff/fields'
import { intakeHref } from '@/features/counter/intake/intakeHref'
import type { CounterIntakeView } from '@/features/counter/intake/intakeView'
import { formatCents } from '@/lib/money'

function FeeNote({ view }: { view: CounterIntakeView }) {
  if (view.feeEstimateCents === null || view.feeEstimateCents <= 0) return null
  const amount = formatCents(view.feeEstimateCents)
  return (
    <p>
      {view.payTiming === 'at_intake'
        ? `The fee of ${amount} is due now. You take it on the next step, after submitting.`
        : `The estimated fee of ${amount} is due when the town approves the application.`}
    </p>
  )
}

export function SubmitStep({ view }: { view: CounterIntakeView }) {
  return (
    <section aria-labelledby="attest" className="flex flex-col gap-4">
      <h2 id="attest">Attestation and submit</h2>
      <p>The applicant signs this statement on the paper form:</p>
      <p className="max-w-[75ch] rounded-md border p-4">{view.attestationText}</p>
      <FeeNote view={view} />
      <ActionForm
        action={submitIntakeAction}
        submitLabel="Submit the application"
        variant="default"
      >
        <input type="hidden" name="applicationId" value={view.applicationId} />
        <CheckField
          name="signedOnPaper"
          label="The applicant signed the attestation on paper"
          required
        />
      </ActionForm>
      <Link href={intakeHref(view.applicationId, 'documents')}>Back to documents</Link>
    </section>
  )
}
