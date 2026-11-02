import type { NoticeRequirementRule } from '@packs/nh/schema'
import type { RecipientRole } from '@/features/abutters/roles'
import { computeRuleDue, resolveRuleLength } from '@/features/clocks/ruleEngine'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import type { NoticeChannel } from '@/features/notices/channels'
import { applies } from '@/features/notices/requirementsFor'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

const EMPTY_FACTS: ProjectFacts = { classification: null, dwellingUnits: null, afterTheFact: false }

export interface RequirementFlags {
  regionalImpact: boolean
  desWithin: boolean
}

export interface PlannedRequirement {
  channel: NoticeChannel
  recipients: { roles: RecipientRole[] } | { public: true }
  dueOn: CivilDate
  leadDays: number
  leadSource: 'pack_rule' | 'town_setting'
}

export interface PlanInput {
  hearingDate: CivilDate
  flags: RequirementFlags
  townLeadDays: Record<string, number>
  publicChoice: 'public_posting' | 'newspaper' | null
}

function channelOf(rule: NoticeRequirementRule, choice: PlanInput['publicChoice']): NoticeChannel {
  if (typeof rule.channel === 'string') return rule.channel
  const options = rule.channel.townChoice
  const [first] = options
  return choice !== null && options.includes(choice) ? choice : (first ?? 'public_posting')
}

export function planRequirement(
  rule: NoticeRequirementRule,
  input: PlanInput,
): PlannedRequirement | null {
  if (!applies(rule, input.flags)) return null
  const lead = ruleByKey(loadPack(), rule.leadRuleKey)
  if (lead.kind !== 'clock') return null
  const length = resolveRuleLength(lead, EMPTY_FACTS, null, input.townLeadDays[lead.key])
  const { due } = computeRuleDue(lead, length, input.hearingDate, packHolidayCalendar())
  return {
    channel: channelOf(rule, input.publicChoice),
    recipients: rule.recipients,
    dueOn: due,
    leadDays: length.value,
    leadSource: length.source,
  }
}
