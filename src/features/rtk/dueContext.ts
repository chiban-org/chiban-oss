import type { SubjectDueContext } from '@/features/clocks/subjectDue'
import { packCountingCitations, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack } from '@/features/packs/loadPack'

export function rtkDueContext(): SubjectDueContext {
  return {
    holidays: packHolidayCalendar(),
    packVersion: loadPack().version,
    citations: packCountingCitations(),
  }
}
