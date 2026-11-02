import { formatCivilDate } from '@/lib/formatDate'

const COPY: Record<string, string> = {
  forbidden: 'You do not have permission to do this.',
  not_found: 'That record was not found.',
  wrong_board: 'That meeting belongs to a different board than this application.',
  meeting_not_set: 'Set that meeting for this application before recording the vote.',
  meeting_cancelled: 'That meeting was cancelled. Choose another one.',
  not_submitted: 'The application is not waiting for its acceptance step.',
  not_under_review: 'The application is not under review.',
  already_scheduled: 'That meeting is already on the calendar.',
  already_cancelled: 'That meeting is already cancelled.',
  reason_required: 'Enter a reason of at least 10 characters.',
  note_required: 'Describe why this parcel belongs on the list.',
  municipality_required: 'Choose at least one affected municipality.',
  unknown_municipality: 'One of those municipalities has no contact on file.',
  board_ref_required: 'Enter the board reference for the earlier determination.',
  clock_not_overdue: 'The board decision deadline has not passed on that date.',
  not_draft: 'This list has been issued or replaced and can no longer be changed.',
  not_board: 'This is not a board application.',
  parcel_layer_unavailable:
    'The parcel layer has no usable import, so no list can be drawn. Import the parcel layer first.',
  officers_required: 'Enter at least one officer, each with a name and a mailing address.',
  tenants_required: 'Enter at least one tenant, each with a name and a mailing address.',
  owner_required: 'Enter the park owner name and mailing address.',
  name_required: 'Enter a name.',
  address_required: 'Enter a mailing address.',
  holder_required: 'Enter the holder name.',
  parcel_required: 'Choose at least one parcel.',
  name_and_address_required: 'Enter both a name and a mailing address.',
  notice_costs_paid:
    'The notice costs are paid, so the application cannot be ended for nonpayment.',
  not_decided: 'The application has not been decided yet.',
  not_bound: 'This kind of application has no deadline to exercise the approval.',
  not_linked: 'Those two applications are not linked.',
  fees_incomplete: 'The notice cost could not be worked out from the issued list.',
  invalid_state: 'That step is not available from the current state.',
  unknown_parcel: 'That parcel ID was not found.',
}

export function boardErrorCopy(error: unknown): string {
  if (typeof error === 'string') return COPY[error] ?? 'Something went wrong. Try again.'
  if (typeof error === 'object' && error !== null) {
    if ('filedTooLate' in error) {
      const late = (
        error as { filedTooLate: { lastFilingDay: string; earliestMeeting: string | null } }
      ).filedTooLate
      const next =
        late.earliestMeeting === null
          ? 'No later meeting is on the calendar yet.'
          : `The earliest meeting it can be accepted at is ${formatCivilDate(late.earliestMeeting)}.`
      return `This application was filed too late for that meeting. The last day to file was ${formatCivilDate(late.lastFilingDay)}. ${next}`
    }
    if ('incomplete' in error) {
      const items = (error as { incomplete: { detail: string }[] }).incomplete
      return `The list cannot be issued yet. ${items.map((i) => i.detail).join(' ')}`
    }
    if ('gateBlocked' in error) {
      const gates = (
        error as {
          gateBlocked: { label: string; effective: string; outcome: { reason?: string } }[]
        }
      ).gateBlocked
      const blocked = gates.filter((g) => g.effective === 'blocked')
      return `A rule blocks this step. ${blocked.map((g) => g.outcome.reason ?? g.label).join(' ')}`
    }
  }
  return 'Something went wrong. Try again.'
}
