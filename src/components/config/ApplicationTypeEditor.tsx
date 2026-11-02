'use client'

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

const list = (text: string) =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')

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
          onChange={(e) =>
            set({
              classification:
                e.target.value === '' ? undefined : (e.target.value as 'nh.building_permit'),
            })
          }
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
        <Input
          label="Checklist keys (comma separated)"
          value={body.checklistKeys.join(', ')}
          onChange={(e) => set({ checklistKeys: list(e.target.value) })}
        />
        <Input
          label="Template keys (comma separated)"
          value={body.templateKeys.join(', ')}
          onChange={(e) => set({ templateKeys: list(e.target.value) })}
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
        <Area
          label="Sub-steps (one per line: state:key:label)"
          rows={4}
          value={body.workflow.substeps.map((s) => `${s.state}:${s.key}:${s.label}`).join('\n')}
          onChange={(e) =>
            set({
              workflow: {
                ...body.workflow,
                substeps: e.target.value
                  .split('\n')
                  .filter((l) => l.trim() !== '')
                  .map((l) => {
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
