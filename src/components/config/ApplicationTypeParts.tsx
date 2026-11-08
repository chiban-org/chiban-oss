'use client'

import Link from 'next/link'
import { useEditorContext } from '@/components/config/EditorContextProvider'
import { CheckedNames, NamePicker } from '@/components/config/plainFields'
import { Check, type FieldErrors, FieldGroup } from '@/components/config/primitives'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { STATE_LABELS } from '@/features/applications/states'
import { NO_REFERENCE_CHOICES } from '@/features/config/referenceChoices'

type SetPatch = (patch: Partial<ApplicationTypeBody>) => void

const CLOSES_TEXT: Record<ApplicationTypeBody['workflow']['closesOn'], string> = {
  final_inspection_passed: 'when the final inspection passes',
  certificate_of_occupancy: 'when the certificate of occupancy is issued',
  staff_closes: 'when staff close it',
  issuance: 'when it is issued',
  expiration: 'when it expires',
}

export function ReferenceFields({
  body,
  set,
  errors,
}: {
  body: ApplicationTypeBody
  set: SetPatch
  errors: FieldErrors
}) {
  const references = useEditorContext().references ?? NO_REFERENCE_CHOICES
  return (
    <>
      <FieldGroup name="references" label="Settings this type uses" errors={errors}>
        <div className="grid gap-3 sm:grid-cols-3">
          <NamePicker
            label="Application form"
            value={body.formKey}
            choices={references.form}
            onChange={(formKey) => set({ formKey })}
          />
          <NamePicker
            label="Fee schedule"
            value={body.feeScheduleKey}
            choices={references.fee_schedule}
            onChange={(feeScheduleKey) => set({ feeScheduleKey })}
          />
          <NamePicker
            label="Conditions staff can attach"
            value={body.conditionLibraryKey}
            choices={references.condition_library}
            onChange={(conditionLibraryKey) => set({ conditionLibraryKey })}
          />
        </div>
      </FieldGroup>
      <FieldGroup name="checklists" label="Inspection checklists" errors={errors}>
        <CheckedNames
          legend="Inspections for this type"
          hint="Tick the inspections this type needs, including exactly one final inspection. Leave all unticked if it needs no inspections."
          values={body.checklistKeys}
          choices={references.inspection_checklist}
          empty="No inspection checklists yet. Add one under Inspection checklists."
          onChange={(checklistKeys) => set({ checklistKeys })}
        />
      </FieldGroup>
      <FieldGroup name="templateKeys" label="Documents" errors={errors}>
        <CheckedNames
          legend="Documents Chiban writes for this type"
          hint="The permit, notices and letters staff can produce from an application of this type."
          values={body.templateKeys}
          choices={references.template}
          empty="No templates yet. Add one under Templates."
          onChange={(templateKeys) => set({ templateKeys })}
        />
      </FieldGroup>
    </>
  )
}

export function WorkflowSummary({
  body,
  errors,
}: {
  body: ApplicationTypeBody
  errors: FieldErrors
}) {
  const { substeps, closesOn, allowsDirectIssue } = body.workflow
  const states = [...new Set(substeps.map((s) => s.state))]
  return (
    <FieldGroup name="workflow" label="Workflow" errors={errors}>
      {states.length === 0 ? (
        <p className="m-0 text-sm">
          No extra steps. Applications move straight through each stage.
        </p>
      ) : (
        <ul className="m-0 grid gap-1 pl-5 text-sm">
          {states.map((state) => (
            <li key={state}>
              {`${STATE_LABELS[state]}: ${substeps
                .filter((s) => s.state === state)
                .map((s) => s.label)
                .join(', ')}`}
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 mt-2 text-sm">
        {`Closes ${CLOSES_TEXT[closesOn]}.${allowsDirectIssue ? ' Staff may issue it at the counter.' : ''}`}
      </p>
      <p className="m-0 mt-2 text-sm">
        <Link href={`/staff/settings/workflow/${encodeURIComponent(body.key)}`}>
          Change the steps
        </Link>
      </p>
    </FieldGroup>
  )
}

export function ReportFieldsSummary({ body }: { body: ApplicationTypeBody }) {
  const n = body.reportFields?.length ?? 0
  return (
    <FieldGroup name="reportFields" label="Report columns" errors={{}}>
      <p className="m-0 text-sm">
        {n === 0
          ? 'The permit volume and processing time reports show counts only.'
          : `The permit volume and processing time reports add up ${n === 1 ? 'one answer' : `${String(n)} answers`} from the application form.`}
      </p>
      <p className="m-0 mt-2 text-sm">
        <Link href={`/staff/settings/report-fields/${encodeURIComponent(body.key)}`}>
          Choose report columns
        </Link>
      </p>
    </FieldGroup>
  )
}

export function RuleFields({
  offered,
  mandatory,
  bindings,
  set,
  errors,
}: {
  offered: { key: string; label: string }[]
  mandatory: ReadonlySet<string>
  bindings: string[]
  set: SetPatch
  errors: FieldErrors
}) {
  const on = offered.filter((r) => mandatory.has(r.key) || bindings.includes(r.key)).length
  return (
    <FieldGroup name="bindings" label="State law rules" errors={errors}>
      <p className="m-0 text-sm text-muted-foreground">
        The deadlines and periods Chiban tracks for this type. Rules the kind of proceeding requires
        are always on.
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-medium">{`Show the rules (${String(on)} on)`}</summary>
        <div className="mt-2 grid gap-1">
          {offered.map((rule) => {
            const locked = mandatory.has(rule.key)
            return (
              <Check
                key={rule.key}
                label={rule.label}
                checked={locked || bindings.includes(rule.key)}
                disabled={locked}
                onChange={(checked) =>
                  set({
                    bindings: checked
                      ? [...bindings, rule.key]
                      : bindings.filter((b) => b !== rule.key),
                  })
                }
              />
            )
          })}
        </div>
      </details>
    </FieldGroup>
  )
}
