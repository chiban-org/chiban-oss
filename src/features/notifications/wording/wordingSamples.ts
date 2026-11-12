import type { WordingValues } from '@/features/notifications/wording/wordingFields'

export const SAMPLE_LINK_TEXT = '[link Chiban adds]'

export function sampleValues(townName: string): WordingValues {
  return {
    'application.number': 'BP-2026-0042',
    'applicant.name': 'Jordan Rivera',
    'town.name': townName,
    'fees.amount': '$125.00',
    'receipt.number': 'R-2026-0107',
    'inspection.type': 'Framing',
    'inspection.date': 'November 20, 2026',
    'inspection.time': '9:00 AM',
    'inspection.result': 'passed',
    'permit.revision': '2',
    'account.from': 'from your account',
    'account.in': 'in your account',
    'board.name': 'Planning Board',
    'project.title': 'Garage addition',
    'comments.by': 'November 20, 2026',
    'clock.name': 'Board action',
    'clock.due': 'November 20, 2026',
    'decision.outcome': 'Approved with conditions',
    'decision.filedOn': 'November 12, 2026',
    'recipient.name': 'Robin Vale',
    'member.title': 'alternate',
    'packet.title': 'Alder Pond Planning Board packet, December 15, 2026',
    'meeting.date': 'December 15, 2026',
    'meeting.when': 'Tuesday, December 15, 2026 at 7:00 PM, Town Hall, Meeting Room 2',
    'packet.changes': 'The staff report was replaced.',
    'packet.where': 'Sign in to read it.',
    'meeting.reason': 'the hearing room is closed for repairs',
    'link.days': '14',
    'claim.namedAs': 'as a contractor on a project',
    'request.number': 'RTK-2026-0012',
    'request.receivedOn': 'November 9, 2026',
    'request.due': 'November 16, 2026',
    'records.releasedOn': 'November 12, 2026',
    'records.linkNote':
      ' The files were too large to attach to an email, so they are at this link instead.',
  }
}
