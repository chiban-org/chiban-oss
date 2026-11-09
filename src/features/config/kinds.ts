import { civilDateSchema } from '@packs/nh/schema'
import type { ZodType } from 'zod'
import { z } from 'zod'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
import { BoardSettingsBodySchema } from '@/features/boards/boardSettingsSchema'
import { RegionalContactsBodySchema } from '@/features/boards/regionalContactsSchema'
import { ConditionLibraryBodySchema } from '@/features/conditions/conditionSchema'
import { FeeScheduleBodySchema } from '@/features/fees/feeSchema'
import { FormBodySchema } from '@/features/forms/formSchema'
import { ChecklistBodySchema } from '@/features/inspections/checklistSchema'
import { InspectionSettingsBodySchema } from '@/features/inspections/settingsSchema'
import { NotificationWordingBodySchema } from '@/features/notifications/wording/wordingSchema'
import { PaymentSettingsBodySchema } from '@/features/payments/settingsSchema'
import { ReviewRoutesBodySchema } from '@/features/reviews/routesSchema'
import { TemplateBodySchema } from '@/features/templates/templateSchema'
import { TownProfileBodySchema } from '@/features/town/profileSchema'

export const CONFIG_KINDS = [
  'application_type',
  'form',
  'fee_schedule',
  'template',
  'condition_library',
  'inspection_checklist',
  'town_rule_setting',
  'local_code_amendment',
  'payment_settings',
  'inspection_settings',
  'board_settings',
  'regional_contacts',
  'review_routes',
  'town_profile',
  'notification_wording',
] as const
export type ConfigKind = (typeof CONFIG_KINDS)[number]

export const SINGLETON_KEY = 'default'

export const SINGLETON_KINDS: readonly ConfigKind[] = [
  'payment_settings',
  'inspection_settings',
  'board_settings',
  'regional_contacts',
  'review_routes',
  'town_profile',
  'notification_wording',
]

export function isSingletonKind(kind: ConfigKind): boolean {
  return SINGLETON_KINDS.includes(kind)
}

const PINNED_KINDS: readonly ConfigKind[] = [
  'application_type',
  'form',
  'fee_schedule',
  'template',
  'condition_library',
  'inspection_checklist',
]

export function isPinnedKind(kind: ConfigKind): boolean {
  return PINNED_KINDS.includes(kind)
}

export const TownRuleSettingBodySchema = z.object({
  ruleKey: z.string().min(1),
  value: z.number(),
  adoptingAuthority: z.string().optional(),
  adoptedOn: civilDateSchema.optional(),
})
export type TownRuleSettingBody = z.infer<typeof TownRuleSettingBodySchema>

export const LocalCodeAmendmentBodySchema = z.object({
  title: z.string().min(1),
  codeSection: z.string().min(1),
  adoptingAuthority: z.string().min(1),
  adoptedOn: civilDateSchema,
  reviewBoardConfirmedOn: civilDateSchema.nullable(),
  stateText: z.string().optional(),
  townText: z.string().optional(),
})
export type LocalCodeAmendmentBody = z.infer<typeof LocalCodeAmendmentBodySchema>

export const CONFIG_SCHEMAS: Record<ConfigKind, ZodType> = {
  application_type: ApplicationTypeBodySchema,
  form: FormBodySchema,
  fee_schedule: FeeScheduleBodySchema,
  template: TemplateBodySchema,
  condition_library: ConditionLibraryBodySchema,
  inspection_checklist: ChecklistBodySchema,
  town_rule_setting: TownRuleSettingBodySchema,
  local_code_amendment: LocalCodeAmendmentBodySchema,
  payment_settings: PaymentSettingsBodySchema,
  inspection_settings: InspectionSettingsBodySchema,
  board_settings: BoardSettingsBodySchema,
  regional_contacts: RegionalContactsBodySchema,
  review_routes: ReviewRoutesBodySchema,
  town_profile: TownProfileBodySchema,
  notification_wording: NotificationWordingBodySchema,
}

const CONFIG_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export const CONFIG_KEY_ISSUE: ConfigIssue = {
  path: 'key',
  message:
    'Use letters, numbers, hyphens, underscores, and dots, starting with a letter or number.',
}

export function isValidConfigKey(key: string): boolean {
  return CONFIG_KEY_PATTERN.test(key)
}

export interface ConfigIssue {
  path: string
  message: string
}

export function isConfigKind(value: string): value is ConfigKind {
  return (CONFIG_KINDS as readonly string[]).includes(value)
}
