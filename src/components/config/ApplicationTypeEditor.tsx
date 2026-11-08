'use client'

import {
  ReferenceFields,
  RuleFields,
  WorkflowSummary,
} from '@/components/config/ApplicationTypeParts'
import { DocumentItemsEditor } from '@/components/config/DocumentItemsEditor'
import { useEditorContext } from '@/components/config/EditorContextProvider'
import { Area, type FieldErrors, FieldGroup, Input, Pick } from '@/components/config/primitives'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { ruleChoicesFor } from '@/features/config/ruleChoices'

export interface PackRuleOption {
  key: string
  label: string
}

export interface ClassificationOption {
  key: string
  label: string
  mandatoryRuleKeys: string[]
  boardKind: string | null
}

interface Props {
  body: ApplicationTypeBody
  onChange: (next: ApplicationTypeBody) => void
  errors: FieldErrors
  packRules: PackRuleOption[]
  classifications: ClassificationOption[]
}

const PAY_TIMING = [
  ['at_intake', 'When the application is submitted'],
  ['at_approval', 'When the application is approved'],
] as const

export function ApplicationTypeEditor({
  body,
  onChange,
  errors,
  packRules,
  classifications,
}: Props) {
  const classification = classifications.find((c) => c.key === body.classification)
  const mandatory = new Set(classification?.mandatoryRuleKeys ?? [])
  const offered = ruleChoicesFor(packRules, classification)
  const set = (patch: Partial<ApplicationTypeBody>) => onChange({ ...body, ...patch })
  const formFields = new Map(Object.entries(useEditorContext().formFields ?? {}))
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="Name"
          hint="What applicants and staff see, for example Building permit."
          value={body.label}
          onChange={(e) => set({ label: e.target.value })}
        />
        <Input
          label="Number prefix"
          hint="One to four capital letters that start each application number, such as BP."
          value={body.prefix}
          maxLength={4}
          onChange={(e) => set({ prefix: e.target.value.toUpperCase() })}
        />
        <Pick
          label="Fees are paid"
          hint="The fee schedule can also charge at renewal or with notice."
          value={body.payTiming}
          options={PAY_TIMING}
          onChange={(e) => set({ payTiming: e.target.value as ApplicationTypeBody['payTiming'] })}
        />
      </div>
      <FieldGroup name="classification" label="Kind of proceeding" errors={errors}>
        <Pick
          label="Kind of proceeding"
          hint="Sets the state law deadlines, notices and board steps this type follows."
          value={body.classification ?? ''}
          options={[
            ['', 'Choose one'],
            ...classifications.map((c): [string, string] => [c.key, c.label]),
          ]}
          onChange={(e) => {
            const chosen = classifications.find((c) => c.key === e.target.value)
            set({
              classification:
                e.target.value === ''
                  ? undefined
                  : (e.target.value as ApplicationTypeBody['classification']),
              bindings: [...new Set([...body.bindings, ...(chosen?.mandatoryRuleKeys ?? [])])],
            })
          }}
        />
      </FieldGroup>
      <ReferenceFields body={body} set={set} errors={errors} />
      <WorkflowSummary body={body} errors={errors} />
      <DocumentItemsEditor
        items={body.documents ?? []}
        fields={formFields.get(body.formKey) ?? []}
        errors={errors}
        onChange={(documents) => set({ documents })}
      />
      <RuleFields
        offered={offered}
        mandatory={mandatory}
        bindings={body.bindings}
        set={set}
        errors={errors}
      />
      <Area
        label="Applicant statement"
        hint="The applicant confirms this statement before they submit."
        rows={3}
        value={body.attestationText}
        onChange={(e) => set({ attestationText: e.target.value })}
      />
    </>
  )
}
