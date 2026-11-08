import type { BoardKind } from '@packs/nh/schema'
import { missingBoardMessage } from '@/features/boards/townBoards'
import { channelLabel } from '@/features/notices/channels'
import { formatCivilDate } from '@/lib/formatDate'

const COPY: Record<string, string> = {
  forbidden: 'You do not have permission to do this.',
  not_found: 'That record was not found.',
  unknown_board: 'Choose a board that is still active.',
  wrong_board: 'That meeting belongs to a different board than this application.',
  meeting_not_set: 'Set that meeting for this application before recording the vote.',
  meeting_cancelled: 'That meeting was cancelled. Choose another one.',
  before_meeting: 'The date cannot be before the meeting.',
  not_submitted: 'The application is not waiting for its acceptance step.',
  not_under_review: 'The application is not under review.',
  already_scheduled: 'That meeting is already on the calendar.',
  already_cancelled: 'That meeting is already cancelled.',
  meeting_past: 'That meeting has already taken place, so it cannot be cancelled.',
  cancelled_meeting: 'That meeting was cancelled, so its agenda can no longer be changed.',
  reason_required: 'Enter a reason of at least 10 characters.',
  note_required: 'Describe why this parcel belongs on the list.',
  municipality_required: 'Choose at least one affected municipality.',
  unknown_municipality: 'One of those municipalities has no contact on file.',
  board_ref_required: 'Enter the board reference for the earlier determination.',
  after_issuance:
    'The regional impact record is fixed once the permit is issued or the application is closed.',
  clock_not_overdue: 'The board decision deadline has not passed on that date.',
  not_draft: 'This can only be changed while it is a draft.',
  not_board: 'This is not a board application.',
  application_closed: 'This application is finished, so this can no longer be changed.',
  parcel_layer_unavailable:
    'The parcel layer has no usable import, so no list can be drawn. Import the parcel layer first.',
  officers_required: 'Enter at least one officer, each with a name and a mailing address.',
  tenants_required: 'Enter at least one tenant, each with a name and a mailing address.',
  owner_required: 'Enter the park owner name and mailing address.',
  association_exists:
    'This parcel already has an association on file. Use Edit on its row to change it.',
  park_exists: 'This parcel already has a park on file. Use Edit on its row to change it.',
  not_ended: 'This restriction has not been ended.',
  entry_ended: 'This contact has ended, so it cannot be confirmed as still correct.',
  ending_used:
    'A list issued after this ending already left the holder off, so the ending cannot be undone. Add the holder again instead.',
  email_taken: 'Another person already uses that email address.',
  term_order: 'The term cannot end before it starts.',
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
  no_issued_list: 'Issue the abutter list before scheduling a hearing.',
  list_out_of_date:
    'The abutter list was issued before the regional impact or water proximity finding. Draw and issue a new list first.',
  determination_missing: 'Record the regional impact and water proximity determinations first.',
  details_required: 'Enter the date, time, and place that were announced at the meeting.',
  not_properly_noticed:
    'The hearing is not properly noticed. Record timely proof for every notice item.',
  not_continuable: 'Only a scheduled hearing can be continued.',
  reference_required: 'Enter the tracking number from the receipt.',
  future_date: 'The date cannot be in the future.',
  before_vote: 'The decision cannot be filed before the date of the vote.',
  document_not_found:
    'Upload the certificate or receipt to this application first, then choose it.',
  wrong_document:
    'Choose a file uploaded as the minutes, certificate, or receipt, not the application or a generated notice.',
  item_not_found: 'Choose at least one notice item.',
  hearing_not_held: 'The hearing has not been held yet.',
  votes_inconsistent: 'The member votes do not add up to the totals.',
  already_filed: 'This decision has already been filed.',
  no_written_decision: 'Generate the Notice of Decision before filing.',
  already_generated: 'The decision documents have already been generated.',
  no_template: 'The application type has no template for this document. Add one in Settings.',
  not_regional: 'This decision has no regional impact, so there is nothing to send.',
  contacts_missing: 'Add the regional planning commission and affected municipalities in Settings.',
  no_clock: 'The transmittal deadline was not started for this application.',
  route_not_allowed: 'That step does not follow from the one you chose.',
  wrong_outcome: 'Choose whether the rehearing was granted or denied.',
  before_parent: 'The date cannot be before the step it follows.',
  duplicate_step: 'That step is already recorded after the one it follows.',
  no_route: 'No Technical Review Committee route is set for this application type.',
  staff_account: 'That email belongs to a staff account. Board members need their own account.',
  send_failed:
    'The email could not be sent. The record was saved, so check the address and try again.',
  empty: 'There is nothing to include yet.',
  agenda_not_published: 'Show the agenda on the public site before making the meeting packet.',
  already_ended: 'That membership has already ended.',
  not_started: 'That term has not started yet.',
  packet_exists:
    'This meeting already has a packet. Change it in the Packet section of the meeting page.',
  already_published: 'This agenda is already on the public site. Reopen it to change it.',
}

const FALLBACK = 'Something went wrong. Try again.'

const NOTICE_STATE_WORDS: Record<string, string> = { missing: 'Missing', proved_late: 'Late' }
const FIELD_WORDS: Record<string, string> = {
  findings: 'Findings',
  conditions: 'Conditions',
  reasonsForDisapproval: 'Reasons for disapproval',
}

function noticeItemsText(
  items: { channel: string; recipientName: string | null; state: string }[],
) {
  const describe = (state: string) =>
    items
      .filter((i) => i.state === state)
      .map((i) =>
        [channelLabel(i.channel), i.recipientName].filter((p) => p !== null && p !== '').join(', '),
      )
  return Object.entries(NOTICE_STATE_WORDS)
    .map(([state, word]) => ({ word, names: describe(state) }))
    .filter((g) => g.names.length > 0)
    .map((g) => `${g.word}: ${g.names.join('; ')}.`)
    .join(' ')
}

function objectErrorCopy(error: object): string | null {
  {
    if ('noBoard' in error) {
      return missingBoardMessage((error as { noBoard: BoardKind }).noBoard)
    }
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
    if ('notProperlyNoticed' in error) {
      const items = (error as { notProperlyNoticed: Parameters<typeof noticeItemsText>[0] })
        .notProperlyNoticed
      return `The hearing is not properly noticed yet. ${noticeItemsText(items)}`
    }
    if ('missingFields' in error) {
      const fields = (error as { missingFields: string[] }).missingFields
      return `The decision cannot be recorded yet. Still needed: ${fields.map((f) => FIELD_WORDS[f] ?? f).join(', ')}.`
    }
    if ('methodNotAllowed' in error) {
      const channels = (error as { methodNotAllowed: string[] }).methodNotAllowed
      return `That proof does not satisfy notice by ${channels.join(', ')}. Leave those items unticked and record their own proof separately.`
    }
    if ('notSeated' in error) {
      const names = (error as { notSeated: string[] }).notSeated
      return `Only members seated on the board on the date of the vote can vote. Not seated: ${names.join(', ')}. Check the names against the board members page.`
    }
    if ('departmentWithoutReviewer' in error) {
      const names = (error as { departmentWithoutReviewer: string[] }).departmentWithoutReviewer
      return `These departments have no active reviewer: ${names.join(', ')}. Add one in the Technical Review Committee settings.`
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
  return null
}

export function boardErrorCopy(error: unknown): string {
  if (typeof error === 'string') return COPY[error] ?? FALLBACK
  if (typeof error === 'object' && error !== null) return objectErrorCopy(error) ?? FALLBACK
  return FALLBACK
}
