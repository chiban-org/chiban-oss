'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  Check,
  type FieldErrors,
  FieldGroup,
  Input,
  Pick,
} from '@/components/config/primitives'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'

export interface PackRuleOption {
  key: string
  label: string
}

export interface ClassificationOption {
  key: string
  label: string
  mandatoryRuleKeys: string[]
}

interface Props {
  body: ApplicationTypeBody
  onChange: (next: ApplicationTypeBody) => void
  errors: FieldErrors
  packRules: PackRuleOption[]
  classifications: ClassificationOption[]
}

function ListInput({
  label,
  values,
  onValues,
  separator,
  multiline,
}: {
  label: string
  values: string[]
  onValues: (next: string[]) => void
  separator: RegExp
  multiline?: boolean
}) {
  const joined = values.join(multiline === true ? '\n' : ', ')
  const [raw, setRaw] = useState(joined)
  useEffect(() => {
    if (parseWith(raw, separator).join('|') !== values.join('|')) setRaw(joined)
  }, [joined, raw, separator, values])
  const change = (text: string) => {
    setRaw(text)
    onValues(parseWith(text, separator))
  }
  return multiline === true ? (
    <Area label={label} rows={4} value={raw} onChange={(e) => change(e.target.value)} />
  ) : (
    <Input label={label} value={raw} onChange={(e) => change(e.target.value)} />
  )
}

function parseWith(text: string, separator: RegExp): string[] {
  return text
    .split(separator)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

export function ApplicationTypeEditor({
  body,
  onChange,
  errors,
  packRules,
  classifications,
}: Props) {
  const mandatory = new Set(
    classifications.find((c) => c.key === body.classification)?.mandatoryRuleKeys ?? [],
  )
  const set = (patch: Partial<ApplicationTypeBody>) => onChange({ ...body, ...patch })
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Label" value={body.label} onChange={(e) => set({ label: e.target.value })} />
        <Input
          label="Number prefix"
          value={body.prefix}
          onChange={(e) => set({ prefix: e.target.value.toUpperCase() })}
        />
        <Pick
          label="Pay fees"
          value={body.payTiming}
          options={[
            ['at_intake', 'At intake'],
            ['at_approval', 'At approval'],
          ]}
          onChange={(e) => set({ payTiming: e.target.value as 'at_intake' })}
        />
      </div>
      <FieldGroup name="classification" label="Classification" errors={errors}>
        <Pick
          label="Proceeding classification"
          value={body.classification ?? ''}
          options={[
            ['', 'Choose one'],
            ...classifications.map((c): [string, string] => [c.key, c.label]),
          ]}
          onChange={(e) => {
            const chosen = classifications.find((c) => c.key === e.target.value)
            set({
              classification:
                e.target.value === '' ? undefined : (e.target.value as 'nh.building_permit'),
              bindings: [...new Set([...body.bindings, ...(chosen?.mandatoryRuleKeys ?? [])])],
            })
          }}
        />
      </FieldGroup>
      <FieldGroup name="references" label="Configuration this type uses" errors={errors}>
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Form key"
            value={body.formKey}
            onChange={(e) => set({ formKey: e.target.value })}
          />
          <Input
            label="Fee schedule key"
            value={body.feeScheduleKey}
            onChange={(e) => set({ feeScheduleKey: e.target.value })}
          />
          <Input
            label="Condition library key"
            value={body.conditionLibraryKey}
            onChange={(e) => set({ conditionLibraryKey: e.target.value })}
          />
        </div>
        <ListInput
          label="Checklist keys (comma separated)"
          values={body.checklistKeys}
          onValues={(next) => set({ checklistKeys: next })}
          separator={/,/}
        />
        <ListInput
          label="Template keys (comma separated)"
          values={body.templateKeys}
          onValues={(next) => set({ templateKeys: next })}
          separator={/,/}
        />
      </FieldGroup>
      <FieldGroup name="bindings" label="Bindings" errors={errors}>
        <p className="text-sm text-muted-foreground">
          Rules this type is bound to. Rules required by the classification are always on.
        </p>
        {packRules.map((rule) => {
          const locked = mandatory.has(rule.key)
          return (
            <Check
              key={rule.key}
              label={`${rule.label} (${rule.key})`}
              checked={locked || body.bindings.includes(rule.key)}
              disabled={locked}
              onChange={(e) =>
                set({
                  bindings: e.target.checked
                    ? [...body.bindings, rule.key]
                    : body.bindings.filter((b) => b !== rule.key),
                })
              }
            />
          )
        })}
      </FieldGroup>
      <FieldGroup name="workflow" label="Workflow" errors={errors}>
        <Check
          label="Staff may issue straight from submitted"
          checked={body.workflow.allowsDirectIssue}
          onChange={(e) =>
            set({ workflow: { ...body.workflow, allowsDirectIssue: e.target.checked } })
          }
        />
        <Pick
          label="Closes on"
          value={body.workflow.closesOn}
          options={[
            ['final_inspection_passed', 'Final inspection passed'],
            ['certificate_of_occupancy', 'Certificate of occupancy'],
          ]}
          onChange={(e) =>
            set({
              workflow: { ...body.workflow, closesOn: e.target.value as 'final_inspection_passed' },
            })
          }
        />
        <ListInput
          label="Sub-steps (one per line: state:key:label)"
          values={body.workflow.substeps.map((x) => `${x.state}:${x.key}:${x.label}`)}
          separator={/\n/}
          multiline
          onValues={(lines) =>
            set({
              workflow: {
                ...body.workflow,
                substeps: lines.map((l) => {
                  const [state = '', key = '', ...label] = l.split(':')
                  return {
                    state: state.trim() as 'under_review',
                    key: key.trim(),
                    label: label.join(':').trim(),
                  }
                }),
              },
            })
          }
        />
      </FieldGroup>
      <Area
        label="Attestation text"
        rows={3}
        value={body.attestationText}
        onChange={(e) => set({ attestationText: e.target.value })}
      />
    </>
  )
}
