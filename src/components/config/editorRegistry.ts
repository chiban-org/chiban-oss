import type { ComponentType } from 'react'
import {
  AmendmentAdapter,
  ApplicationTypeAdapter,
  ChecklistAdapter,
  ConditionsAdapter,
  type EditorProps,
  FeeAdapter,
  FormAdapter,
  InspectionAdapter,
  PaymentAdapter,
  TemplateAdapter,
  TownRuleAdapter,
} from '@/components/config/editorAdapters'
import type { ConfigKind } from '@/features/config/kinds'

export const CONFIG_EDITORS: Record<ConfigKind, ComponentType<EditorProps>> = {
  application_type: ApplicationTypeAdapter,
  form: FormAdapter,
  fee_schedule: FeeAdapter,
  template: TemplateAdapter,
  condition_library: ConditionsAdapter,
  inspection_checklist: ChecklistAdapter,
  town_rule_setting: TownRuleAdapter,
  local_code_amendment: AmendmentAdapter,
  payment_settings: PaymentAdapter,
  inspection_settings: InspectionAdapter,
}
