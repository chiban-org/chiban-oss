import type { Board } from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { DbOrTx } from '@/db/client'
import type { ApplicationContext } from '@/features/applications/context'
import { getBoardSettings } from '@/features/boards/boardSettings'
import { factsWithDeterminations } from '@/features/clocks/derivedFacts'
import { computeRuleDue } from '@/features/clocks/ruleEngine'
import { resolveClockLength } from '@/features/clocks/startClocks'
import { effectiveBindings } from '@/features/config/bindings'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { type CivilDate, compareCivil } from '@/types/civilDate'

export const FILING_LEAD_KEY = 'nh.pb.filing_lead'

export function filingLeadRule() {
  const rule = ruleByKey(loadPack(), FILING_LEAD_KEY)
  if (rule.kind !== 'clock' || !('value' in rule.length)) {
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'nh.pb.filing_lead must be a plain clock')
  }
  return { rule, packDays: rule.length.value }
}

export interface FilingLead {
  leadDays: number
  lastFilingDay: (meetingDate: CivilDate) => CivilDate
}

export async function filingLeadFor(
  db: DbOrTx,
  app: ApplicationContext,
  board: Board,
  signal: AbortSignal,
): Promise<FilingLead | null> {
  if (!effectiveBindings(app.typeBody, loadPack()).includes(FILING_LEAD_KEY)) return null
  const { rule } = filingLeadRule()
  const settings = await getBoardSettings(db, signal)
  const facts = await factsWithDeterminations(db, app.id, app.facts)
  const resolved = await resolveClockLength(db, rule, facts, loadPack(), signal)
  const leadDays = settings.boards.find((b) => b.board === board)?.filingLeadDays ?? resolved.value
  const length = { unit: 'days' as const, value: leadDays }
  return {
    leadDays,
    lastFilingDay: (meetingDate) =>
      computeRuleDue(rule, length, meetingDate, packHolidayCalendar()).due,
  }
}

export function filedInTime(
  lead: FilingLead | null,
  receivedDate: CivilDate | null,
  meetingDate: CivilDate,
): boolean {
  if (lead === null || receivedDate === null) return true
  return compareCivil(receivedDate, lead.lastFilingDay(meetingDate)) <= 0
}
