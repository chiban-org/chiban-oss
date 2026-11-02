'use client'

import { useActionState, useState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { ApplicationTypeEditor } from '@/components/config/ApplicationTypeEditor'
import { FeeLinesEditor } from '@/components/config/FeeLinesEditor'
import { FormFieldsEditor } from '@/components/config/FormFieldsEditor'
import { PaymentSettingsEditor } from '@/components/config/PaymentSettingsEditor'
import { FieldError, type FieldErrors } from '@/components/config/primitives'
import {
  ChecklistEditor,
  ConditionsEditor,
  LocalAmendmentEditor,
  TemplateEditor,
} from '@/components/config/SimpleEditors'
import { TownRuleEditor } from '@/components/config/TownRuleEditor'
import { Button } from '@/components/ui/button'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { ConditionLibraryBody } from '@/features/conditions/conditionSchema'
import type { EditorContext } from '@/features/config/editorContext'
import type {
  ConfigKind,
  LocalCodeAmendmentBody,
  TownRuleSettingBody,
} from '@/features/config/kinds'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import type { FormBody } from '@/features/forms/formSchema'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'
import type { TemplateBody } from '@/features/templates/templateSchema'
import type { ActionResult } from '@/server/actionRunner'

interface Props {
  kind: ConfigKind
  configKey: string
  initialBody: unknown
  resetKey: string
  context: EditorContext
  saveAction: (formData: FormData) => Promise<ActionResult>
  publishAction: (formData: FormData) => Promise<ActionResult>
}

function Body({
  kind,
  body,
  setBody,
  errors,
  context,
}: {
  kind: ConfigKind
  body: unknown
  setBody: (b: unknown) => void
  errors: FieldErrors
  context: EditorContext
}) {
  switch (kind) {
    case 'form':
      return <FormFieldsEditor body={body as FormBody} onChange={setBody} errors={errors} />
    case 'fee_schedule':
      return <FeeLinesEditor body={body as FeeScheduleBody} onChange={setBody} errors={errors} />
    case 'template':
      return (
        <TemplateEditor
          body={body as TemplateBody}
          onChange={setBody}
          errors={errors}
          mergeFields={context.mergeFields}
        />
      )
    case 'condition_library':
      return (
        <ConditionsEditor body={body as ConditionLibraryBody} onChange={setBody} errors={errors} />
      )
    case 'inspection_checklist':
      return <ChecklistEditor body={body as ChecklistBody} onChange={setBody} errors={errors} />
    case 'payment_settings':
      return <PaymentSettingsEditor body={body as PaymentSettingsBody} onChange={setBody} />
    case 'local_code_amendment':
      return <LocalAmendmentEditor body={body as LocalCodeAmendmentBody} onChange={setBody} />
    case 'town_rule_setting': {
      const typed = body as TownRuleSettingBody
      const rule = context.townRules[typed.ruleKey]
      return rule === undefined ? (
        <p role="alert">This rule is not a town setting in the jurisdiction pack.</p>
      ) : (
        <TownRuleEditor body={typed} onChange={setBody} errors={errors} rule={rule} />
      )
    }
    case 'application_type':
      return (
        <ApplicationTypeEditor
          body={body as ApplicationTypeBody}
          onChange={setBody}
          errors={errors}
          packRules={context.packRules}
          classifications={context.classifications}
        />
      )
  }
}

export function ConfigEditorForm({
  kind,
  configKey,
  initialBody,
  resetKey,
  context,
  saveAction,
  publishAction,
}: Props) {
  const [body, setBody] = useState<unknown>(initialBody)
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setBody(initialBody)
  }
  const [result, run, pending] = useActionState(
    async (_previous: ActionResult | null, formData: FormData) =>
      formData.get('intent') === 'publish'
        ? await publishAction(formData)
        : await saveAction(formData),
    null,
  )
  const errors: FieldErrors = result !== null && !result.ok ? (result.fieldErrors ?? {}) : {}
  return (
    <form action={run} className="max-w-4xl">
      <CsrfField />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="key" value={configKey} />
      <input type="hidden" name="body" value={JSON.stringify(body)} />
      <Body kind={kind} body={body} setBody={setBody} errors={errors} context={context} />
      <FieldError errors={errors} name="_form" />
      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" name="intent" value="publish" disabled={pending}>
          Publish
        </Button>
        <Button type="submit" name="intent" value="save" variant="outline" disabled={pending}>
          Save draft
        </Button>
        <p role="status" className="text-sm">
          {result === null ? null : result.ok ? result.message : result.error}
        </p>
      </div>
    </form>
  )
}
