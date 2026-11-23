import { ActionForm } from '@/components/ActionForm'
import type { HearingView } from '@/features/hearings/views'
import { DecisionFields } from '../DecisionFields'
import { recordDecisionAction } from '../decisionActions'

export function RecordDecisionSection({ view, today }: { view: HearingView; today: string }) {
  return (
    <section aria-labelledby="record-decision">
      <h2 id="record-decision">Record the decision</h2>
      <ActionForm
        action={recordDecisionAction}
        submitLabel="Record decision"
        confirm={{
          title: "Record the board's decision?",
          body: 'The outcome, votes and findings become the decision of record for this application.',
          confirmLabel: 'Record decision',
          tone: 'default',
        }}
        variant="default"
        className="max-w-2xl"
      >
        <input type="hidden" name="applicationId" value={view.applicationId} />
        <input type="hidden" name="hearingId" value={view.hearingId} />
        <DecisionFields
          seated={view.seatedMembers}
          today={today}
          defaultVotedOn={view.defaultVotedOn}
          minVotedOn={view.defaultVotedOn}
          offerFinalApproval={view.offerFinalApproval}
          significance={view.significanceQuestion ?? null}
        />
      </ActionForm>
    </section>
  )
}
