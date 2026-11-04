'use client'

import { useEffect, useMemo } from 'react'
import { ApplicationTypeEditor } from '@/components/config/ApplicationTypeEditor'
import { BoardSettingsEditor } from '@/components/config/BoardSettingsEditor'
import { ChecklistEditor } from '@/components/config/ChecklistEditor'
import { ConditionsEditor } from '@/components/config/ConditionsEditor'
import { useEditorContext } from '@/components/config/EditorContextProvider'
import { FeeLinesEditor } from '@/components/config/FeeLinesEditor'
import { FormBuilder } from '@/components/config/formBuilder/FormBuilder'
import { InspectionSettingsEditor } from '@/components/config/InspectionSettingsEditor'
import { LetterBuilder } from '@/components/config/letterBuilder/LetterBuilder'
import { PaymentSettingsEditor } from '@/components/config/PaymentSettingsEditor'
import type { FieldErrors } from '@/components/config/primitives'
import { RegionalContactsEditor } from '@/components/config/RegionalContactsEditor'
import { ReviewRoutesEditor } from '@/components/config/ReviewRoutesEditor'
import { LocalAmendmentEditor } from '@/components/config/SimpleEditors'
import { TownRuleEditor } from '@/components/config/TownRuleEditor'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { BoardSettingsBody } from '@/features/boards/boardSettings'
import type { RegionalContactsBody } from '@/features/boards/regionalContacts'
import type { ConditionLibraryBody } from '@/features/conditions/conditionSchema'
import type {
  ConfigIssue,
  LocalCodeAmendmentBody,
  TownRuleSettingBody,
} from '@/features/config/kinds'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import { NO_FORM_BUILDER_DATA } from '@/features/forms/formReferences'
import type { FormBody } from '@/features/forms/formSchema'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'
import type { InspectionSettingsBody } from '@/features/inspections/settingsSchema'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'
import type { ReviewRoutesBody } from '@/features/reviews/routesSchema'
import { asDocTemplate } from '@/features/templates/asDocTemplate'
import type { TemplateBody } from '@/features/templates/templateSchema'

export interface EditorProps {
  body: unknown
  onChange: (body: unknown) => void
  issues: ConfigIssue[]
}

function errorsOf(issues: ConfigIssue[]): FieldErrors {
  return Object.fromEntries(issues.map((i) => [i.path, i.message]))
}

export function FormAdapter({ body, onChange, issues }: EditorProps) {
  const { form } = useEditorContext()
  return (
    <FormBuilder
      body={body as FormBody}
      onChange={onChange}
      errors={errorsOf(issues)}
      data={form ?? NO_FORM_BUILDER_DATA}
    />
  )
}

export function FeeAdapter({ body, onChange, issues }: EditorProps) {
  return (
    <FeeLinesEditor body={body as FeeScheduleBody} onChange={onChange} errors={errorsOf(issues)} />
  )
}

export function TemplateAdapter({ body, onChange, issues }: EditorProps) {
  const { template } = useEditorContext()
  const docBody = useMemo(() => asDocTemplate(body as TemplateBody), [body])
  useEffect(() => {
    if (docBody !== body) onChange(docBody)
  }, [docBody, body, onChange])
  if (template === undefined) return <p role="alert">The letter builder could not load.</p>
  return (
    <LetterBuilder body={docBody} onChange={onChange} errors={errorsOf(issues)} data={template} />
  )
}

export function ConditionsAdapter({ body, onChange, issues }: EditorProps) {
  return (
    <ConditionsEditor
      body={body as ConditionLibraryBody}
      onChange={onChange}
      errors={errorsOf(issues)}
    />
  )
}

export function ChecklistAdapter({ body, onChange, issues }: EditorProps) {
  return (
    <ChecklistEditor body={body as ChecklistBody} onChange={onChange} errors={errorsOf(issues)} />
  )
}

export function PaymentAdapter({ body, onChange }: EditorProps) {
  return <PaymentSettingsEditor body={body as PaymentSettingsBody} onChange={onChange} />
}

export function InspectionAdapter({ body, onChange, issues }: EditorProps) {
  return (
    <InspectionSettingsEditor
      body={body as InspectionSettingsBody}
      onChange={onChange}
      errors={errorsOf(issues)}
    />
  )
}

export function AmendmentAdapter({ body, onChange }: EditorProps) {
  return <LocalAmendmentEditor body={body as LocalCodeAmendmentBody} onChange={onChange} />
}

export function TownRuleAdapter({ body, onChange, issues }: EditorProps) {
  const { townRules } = useEditorContext()
  const typed = body as TownRuleSettingBody
  const rule = townRules[typed.ruleKey]
  if (rule === undefined) {
    return <p role="alert">This rule is not a town setting in the jurisdiction pack.</p>
  }
  return <TownRuleEditor body={typed} onChange={onChange} errors={errorsOf(issues)} rule={rule} />
}

export function ApplicationTypeAdapter({ body, onChange, issues }: EditorProps) {
  const { packRules, classifications } = useEditorContext()
  return (
    <ApplicationTypeEditor
      body={body as ApplicationTypeBody}
      onChange={onChange}
      errors={errorsOf(issues)}
      packRules={packRules}
      classifications={classifications}
    />
  )
}

export function BoardSettingsAdapter({ body, onChange, issues }: EditorProps) {
  return (
    <BoardSettingsEditor
      body={body as BoardSettingsBody}
      onChange={onChange}
      errors={errorsOf(issues)}
    />
  )
}

export function RegionalContactsAdapter({ body, onChange }: EditorProps) {
  return <RegionalContactsEditor body={body as RegionalContactsBody} onChange={onChange} />
}

export function ReviewRoutesAdapter({ body, onChange }: EditorProps) {
  return <ReviewRoutesEditor body={body as ReviewRoutesBody} onChange={onChange} />
}
