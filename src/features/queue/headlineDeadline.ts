import { NOTICE_DEADLINE_LABEL } from '@/features/hearings/labels'
import { ruleLabel } from '@/features/packs/ruleLabel'
import type { CivilDate } from '@/types/civilDate'

export interface HeadlineDeadline {
  on: CivilDate
  label: string
}

export function headlineDeadline(
  clockDue: string | null,
  clockRuleKey: string | null,
  noticeDue: string | null,
): HeadlineDeadline | null {
  if (noticeDue !== null && (clockDue === null || noticeDue < clockDue))
    return { on: noticeDue as CivilDate, label: NOTICE_DEADLINE_LABEL }
  if (clockDue === null || clockRuleKey === null) return null
  return { on: clockDue as CivilDate, label: ruleLabel(clockRuleKey) }
}
