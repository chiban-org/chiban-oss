import Link from 'next/link'
import { PaymentForm } from '@/app/(staff)/staff/applications/[applicationId]/paymentControls'
import { COUNTER_START } from '@/app/(staff)/staff/counter/counterHref'
import { sendApplicantClaimAction } from '@/app/(staff)/staff/counter/intakeActions'
import { ClaimLinkButton } from '@/components/counter/ClaimLinkButton'
import { intakeHref } from '@/features/counter/intake/intakeHref'
import type { CounterIntakeView } from '@/features/counter/intake/intakeView'
import type { ApplicationPayments } from '@/features/payments/applicationPayments'
import { formatCents } from '@/lib/money'

export function FeeStep({
  view,
  payments,
}: {
  view: CounterIntakeView
  payments: ApplicationPayments
}) {
  return (
    <section aria-labelledby="fee" className="flex flex-col gap-4">
      <h2 id="fee">Fee</h2>
      <p role="status">
        {`${view.number} is submitted. The fee due now is ${formatCents(payments.balance.dueCents)}.`}
      </p>
      <PaymentForm payments={payments} variant="default" />
      <Link href={intakeHref(view.applicationId, 'done')}>
        Finish without taking payment. The applicant pays later.
      </Link>
    </section>
  )
}

function NoticeLine({ view }: { view: CounterIntakeView }) {
  if (view.applicant.hasAccount) {
    return (
      <p>{`The application is in ${view.applicant.name}'s portal, and the email notices go to them.`}</p>
    )
  }
  if (view.applicant.email === null) {
    return (
      <p>{`${view.applicant.name} has no email address on file, so no email notices go out. Mailed notices use the mailing address on the form.`}</p>
    )
  }
  return (
    <p>
      {`${view.applicant.name} has no account. Email notices go to ${view.applicant.email}, each with a link to claim the application online. You can also send a claim link now.`}
    </p>
  )
}

export function DoneStep({ view }: { view: CounterIntakeView }) {
  const claimable = !view.applicant.hasAccount && view.applicant.email !== null
  return (
    <section aria-labelledby="done" className="flex flex-col gap-4">
      <h2 id="done">Done</h2>
      <p role="status">{`${view.number} is submitted for review.`}</p>
      <NoticeLine view={view} />
      {claimable ? (
        <ClaimLinkButton
          applicationId={view.applicationId}
          send={sendApplicantClaimAction}
          label="Send claim link to the applicant"
        />
      ) : null}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Link href={`/staff/applications/${view.applicationId}`} className="font-semibold">
          Open the application record
        </Link>
        <Link href={COUNTER_START}>Back to the counter</Link>
      </div>
    </section>
  )
}
