import type { ReactNode } from 'react'
import { ChosenSteps } from '@/components/counter/CounterSteps'
import { ApplicantStep } from '@/components/counter/intake/ApplicantStep'
import type { ReviewIntakeType } from '@/features/counter/directIssueTypes'
import { findApplicantAccount } from '@/features/counter/intake/applicantAccount'
import type { StaffContext } from '@/server/requireStaff'
import { COUNTER_START, counterHref } from './counterHref'
import { startIntakeAction } from './intakeActions'
import { parcelLabel } from './issueSteps'

export const REVIEW_STEP_LABEL = 'Application type'

export async function applicantStep(
  ctx: StaffContext,
  type: ReviewIntakeType,
  input: { parcelId: string; q: string; applicant: string },
): Promise<ReactNode> {
  const email = input.applicant.trim()
  const [label, account] = await Promise.all([
    parcelLabel(ctx, input.parcelId),
    findApplicantAccount(ctx.db, email, ctx.signal),
  ])
  return (
    <>
      <ChosenSteps
        steps={[
          { label: REVIEW_STEP_LABEL, value: type.label, changeHref: COUNTER_START },
          {
            label: 'Parcel',
            value: label,
            changeHref: counterHref({ q: input.q, type: type.key }),
          },
        ]}
      />
      <ApplicantStep
        key={email}
        choice={{ parcelId: input.parcelId, typeKey: type.key, q: input.q, email, account }}
        start={startIntakeAction}
      />
    </>
  )
}
