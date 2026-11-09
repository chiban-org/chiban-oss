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
  }
}
