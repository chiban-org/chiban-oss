import { STATE_LABELS } from '@/features/applications/states'

export const ACTIVITY_PHRASES: ReadonlyMap<string, string> = new Map(
  Object.entries({
    'application.create': 'Started the application',
    'application.amend': 'Amended the application',
    'application.substep': 'Changed the workflow step',
    'application.note_added': 'Added a staff note',
    'application.document_item.link': 'Filed a document for a required item',
    'application.document_item.unlink': 'Removed a document from a required item',
    'application.document_item.waiver_request': 'Asked to waive a required document',
    'application.document_item.waiver_withdraw': 'Withdrew a request to waive a document',
    'application.document_item.accept': 'Accepted a required item without the document',
    'application.document_item.accept_undo': 'Undid accepting an item without the document',
    'abutters.applicant_parcels.set': "Set the applicant's parcels for the abutter list",
    'appeal.record': 'Recorded an appeal',
    'appeal.resolve': 'Resolved an appeal',
    'board.acceptance_meeting.set': 'Set the acceptance meeting',
    'board.des_determination.record': 'Recorded the NH DES determination',
    'board.final_approval.record': 'Recorded final approval',
    'board.regional_impact.record': 'Recorded the board regional impact finding',
    'board.reliance.link': 'Linked a variance this application relies on',
    'board.terminate_unpaid_notice_costs': 'Ended the application for unpaid notice costs',
    'board.completeness.accepted': 'Recorded the board accepting the application as complete',
    'board.completeness.not_accepted': 'Recorded the board finding the application incomplete',
    'board.certification.pending': 'Recorded a request to the selectmen',
    'board.certification.certified': 'Recorded the selectmen certifying the request',
    'board.certification.refused': 'Recorded the selectmen refusing the request',
    'building.code_edition.record': 'Recorded the building code edition',
    'building.mark_complete': 'Marked the application complete',
    'census.classified': 'Classified the permit for the Census report',
    'certificate.issue': 'Issued the certificate of occupancy',
    'clock.extension': 'Extended a deadline',
    'clock.waiver': 'Waived a deadline',
    'clock.renewal': 'Renewed a deadline',
    'clock.tolling': 'Paused a deadline',
    'clock.statutory_exception': 'Recorded a statutory exception to a deadline',
    'clock.statutory_floor': 'Applied the statutory minimum to a deadline',
    'condition.apply': 'Applied a condition',
    'condition.status': 'Changed the status of a condition',
    'decision.record': 'Recorded the decision',
    'decision.file': 'Filed the decision',
    'decision.documents': 'Attached the decision documents',
    'fee_override.create': 'Overrode a fee',
    'fees.assess': 'Assessed fees',
    'gate.override': 'Overrode a gate',
    'gate.override_revoke': 'Revoked a gate override',
    'gate.statutory_exception': 'Recorded a statutory exception to a gate',
    'hearing.schedule': 'Scheduled a hearing',
    'hearing.continue': 'Continued a hearing',
    'hearing.held': 'Recorded a hearing as held',
    'hearing.properly_noticed': 'Recorded a hearing as properly noticed',
    'permit.correct': 'Corrected the permit',
    'regional_impact.determine': 'Decided whether the project has regional impact',
    'regional_impact.notice': 'Recorded a regional impact notice',
    'review.assign': 'Assigned a reviewer',
    'review.unassign': 'Removed a reviewer',
    'review.comment': 'Added a review comment',
    'review.sign_off': 'Signed off a review',
    'review.board_assign': 'Sent the application to a board for comment',
    'review.board_withdraw': 'Withdrew a request for board comment',
    'review.board_comment': 'Added a board comment',
    'roster.professional.add': 'Added a professional to the application',
  }),
)

const UNKNOWN_PHRASE = 'Changed the record'

const STATE_PHRASES: ReadonlyMap<string, string> = new Map(Object.entries(STATE_LABELS))

function field(after: unknown, key: string): unknown {
  return typeof after === 'object' && after !== null
    ? new Map(Object.entries(after)).get(key)
    : undefined
}

export function activityPhrase(action: string, after: unknown): string {
  if (action === 'application.transition') {
    const state = field(after, 'state')
    const label = typeof state === 'string' ? STATE_PHRASES.get(state) : undefined
    return label === undefined
      ? 'Moved the application to a new status'
      : `Moved the application to ${label}`
  }
  if (action === 'application.responsible_staff') {
    return field(after, 'responsibleUserId') === null
      ? 'Cleared who is responsible'
      : 'Changed who is responsible'
  }
  return ACTIVITY_PHRASES.get(action) ?? UNKNOWN_PHRASE
}
