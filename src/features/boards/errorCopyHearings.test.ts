import { describe, expect, it } from 'vitest'
import { boardErrorCopy } from '@/features/boards/errorCopy'

const FALLBACK = 'Something went wrong. Try again.'
const NEW_CODES = [
  'no_issued_list',
  'determination_missing',
  'list_out_of_date',
  'details_required',
  'not_properly_noticed',
  'not_continuable',
  'method_not_allowed',
  'reference_required',
  'future_date',
  'document_not_found',
  'item_not_found',
  'hearing_not_held',
  'votes_inconsistent',
  'already_filed',
  'no_written_decision',
  'already_generated',
  'no_template',
  'not_regional',
  'contacts_missing',
  'no_clock',
  'route_not_allowed',
  'wrong_outcome',
  'no_route',
  'staff_account',
  'send_failed',
  'empty',
  'already_published',
]

describe('boardErrorCopy for hearings, decisions, and notices', () => {
  it.each(NEW_CODES)('%s has its own sentence with no raw key', (code) => {
    const copy = boardErrorCopy(code)
    expect(copy).not.toBe(FALLBACK)
    expect(copy).not.toContain('_')
  })

  it('lists the notice items that still lack timely proof', () => {
    expect(
      boardErrorCopy({
        notProperlyNoticed: [
          { channel: 'newspaper', recipientName: 'Alder Pond Ledger', state: 'missing' },
          { channel: 'verified_mail', recipientName: 'Pat Heron', state: 'proved_late' },
        ],
      }),
    ).toBe(
      'The hearing is not properly noticed yet. Missing: Newspaper, Alder Pond Ledger. Late: Verified mail, Pat Heron.',
    )
  })

  it('lists the missing decision fields in words', () => {
    expect(boardErrorCopy({ missingFields: ['findings', 'reasonsForDisapproval'] })).toBe(
      'The decision cannot be recorded yet. Still needed: Findings, Reasons for disapproval.',
    )
  })

  it('names the departments with no reviewer', () => {
    expect(boardErrorCopy({ departmentWithoutReviewer: ['Fire', 'Police'] })).toBe(
      'These departments have no active reviewer: Fire, Police. Add one in the Technical Review Committee settings.',
    )
  })
})
