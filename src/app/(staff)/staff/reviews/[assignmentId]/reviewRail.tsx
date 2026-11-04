import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { FactList } from '@/components/layout/PageHeader'
import { type AssignmentView, reviewOpen } from '@/features/reviews/reviewerView'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { formatCivilDate } from '@/lib/formatDate'
import { signOffReviewAction } from '../actions'

function reviewFacts(view: AssignmentView) {
  return [
    { label: 'Your review', value: reviewStatusLabel(view.status) },
    {
      label: 'Comments due',
      value: view.commentDue === null ? 'No date set' : formatCivilDate(view.commentDue),
    },
    {
      label: 'Application',
      value: <Link href={`/staff/applications/${view.applicationId}`}>{view.number}</Link>,
    },
    {
      label: 'Parcel',
      value: (
        <Link href={`/staff/parcels/${view.parcelId}`}>
          {view.parcelDisplayId ?? 'No map-lot ID'}
        </Link>
      ),
    },
  ]
}

function SignOffStep({ view }: { view: AssignmentView }) {
  if (view.status === 'signed_off') return <p className="text-sm">You signed off on this review.</p>
  if (!reviewOpen(view)) {
    return <p className="text-sm">This application is finished, so the review is closed.</p>
  }
  return (
    <>
      <p className="text-sm">Sign off once your comments are in.</p>
      <ActionForm action={signOffReviewAction} submitLabel="Sign off" variant="default">
        <input type="hidden" name="assignmentId" value={view.assignmentId} />
      </ActionForm>
    </>
  )
}

export function ReviewRail({ view }: { view: AssignmentView }) {
  return (
    <>
      <div className="rail-card">
        <NextStep>
          <SignOffStep view={view} />
        </NextStep>
      </div>
      <section aria-label="Key facts" data-plain className="rail-card">
        <FactList facts={reviewFacts(view)} stacked />
      </section>
    </>
  )
}
