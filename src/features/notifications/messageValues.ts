import type { NotificationPayload } from '@/features/notifications/queue'
import type { WordingValues } from '@/features/notifications/wording/wordingFields'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'

function longDate(onDate: string | undefined): string {
  return humanizeIsoDates(onDate ?? '')
}

function civil(onDate: string | undefined | null): string {
  return onDate === undefined || onDate === null || onDate === '' ? '' : formatCivilDate(onDate)
}

function accountPlace(claimed: boolean, preposition: 'in' | 'from'): string {
  return claimed ? 'online once you claim the application' : `${preposition} your account`
}

export function wordingValues(input: {
  payload: NotificationPayload
  townName: string
  claimed: boolean
}): WordingValues {
  const { payload: p, townName, claimed } = input
  return {
    'application.number': p.number,
    'applicant.name': p.applicantName ?? '',
    'town.name': townName,
    'fees.amount': formatCents(p.amountCents ?? 0),
    'receipt.number': p.receiptNumber ?? '',
    'inspection.type': p.inspectionLabel ?? '',
    'inspection.date': longDate(p.onDate),
    'inspection.time': p.atTime ?? '',
    'inspection.result': p.result ?? 'was recorded',
    'permit.revision': p.revision === undefined ? '' : String(p.revision),
    'account.from': accountPlace(claimed, 'from'),
    'account.in': accountPlace(claimed, 'in'),
    'board.name': p.boardName ?? 'board',
    'project.title': p.projectTitle ?? '',
    'comments.by': civil(p.commentBy),
    'clock.name': p.clockLabel ?? '',
    'clock.due': civil(p.dueOn),
    'decision.outcome': p.outcomeLabel ?? '',
    'decision.filedOn': civil(p.filedOn),
  }
}
