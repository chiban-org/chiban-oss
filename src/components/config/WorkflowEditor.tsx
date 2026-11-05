'use client'

import { useActionState, useState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { PublishBar } from '@/components/config/PublishBar'
import { Check, FieldError, Input, Pick, RowButton, rowKey } from '@/components/config/primitives'
import { WorkflowPreview } from '@/components/config/WorkflowPreview'
import { Button } from '@/components/ui/button'
import { useHydrated } from '@/components/useHydrated'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { type CoreState, STATE_LABELS } from '@/features/applications/states'
import { workflowIssueText } from '@/features/workflow/issueText'
import type { WorkflowPreview as Preview } from '@/features/workflow/previewWorkflow'
import { validateWorkflow } from '@/features/workflow/validateWorkflow'
import type { ActionResult } from '@/server/actionRunner'

export type PreviewActionResult =
  | { ok: true; message: string; preview: Preview }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

type Workflow = ApplicationTypeBody['workflow']
type Substep = Workflow['substeps'][number]

export interface WorkflowClassification {
  label: string
  directIssueAllowed: boolean
  requiredSubsteps: { state: CoreState; key: string }[]
}

const EDITABLE: CoreState[] = ['draft', 'submitted', 'under_review', 'decided', 'issued']
const CLOSES_ON = [
  ['final_inspection_passed', 'When the final inspection passes'],
  ['certificate_of_occupancy', 'When the certificate of occupancy is issued'],
  ['staff_closes', 'When staff close it'],
] as const

interface Props {
  typeKey: string
  initialBody: ApplicationTypeBody
  classification: WorkflowClassification
  saveAction: (formData: FormData) => Promise<ActionResult>
  publishAction: (formData: FormData) => Promise<ActionResult>
  previewAction: (formData: FormData) => Promise<PreviewActionResult>
}

function slug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
}

function move(substeps: Substep[], from: number, to: number): Substep[] {
  const next = [...substeps]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

function StateSteps({
  state,
  substeps,
  onChange,
  issues,
}: {
  state: CoreState
  substeps: Substep[]
  onChange: (next: Substep[]) => void
  issues: string[]
}) {
  const own = substeps.map((s, index) => ({ s, index })).filter(({ s }) => s.state === state)
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{STATE_LABELS[state]}</legend>
      {own.map(({ s, index }, position) => (
        <Input
          key={rowKey(`${state}-step`, index)}
          label="Step name"
          value={s.label}
          onChange={(e) =>
            onChange(
              substeps.map((x, n) =>
                n === index
                  ? { ...x, label: e.target.value, key: slug(e.target.value) || x.key }
                  : x,
              ),
            )
          }
          action={
            <div className="flex gap-2">
              <RowButton
                onClick={() => onChange(move(substeps, index, own[position - 1]?.index ?? index))}
              >
                Move up
              </RowButton>
              <RowButton
                onClick={() => onChange(move(substeps, index, own[position + 1]?.index ?? index))}
              >
                Move down
              </RowButton>
              <RowButton onClick={() => onChange(substeps.filter((_, n) => n !== index))}>
                Remove
              </RowButton>
            </div>
          }
        />
      ))}
      <RowButton
        onClick={() =>
          onChange([...substeps, { state, key: `step_${substeps.length + 1}`, label: '' }])
        }
      >
        Add a step
      </RowButton>
      {issues.map((text) => (
        <p key={text} role="alert" className="text-sm text-status-failed-fg">
          {text}
        </p>
      ))}
    </fieldset>
  )
}

export function WorkflowEditor({
  typeKey,
  initialBody,
  classification,
  saveAction,
  publishAction,
  previewAction,
}: Props) {
  const [workflow, setWorkflow] = useState<Workflow>(initialBody.workflow)
  const [preview, setPreview] = useState<Preview | null>(null)
  const hydrated = useHydrated()
  const body = { ...initialBody, workflow }
  const [result, run, pending] = useActionState(
    async (_previous: ActionResult | PreviewActionResult | null, formData: FormData) => {
      const intent = formData.get('intent')
      if (intent === 'preview') {
        const shown = await previewAction(formData)
        if (shown.ok) setPreview(shown.preview)
        return shown
      }
      return intent === 'publish' ? await publishAction(formData) : await saveAction(formData)
    },
    null,
  )
  const issues = validateWorkflow(workflow, classification)
  const issueText = (state: CoreState) =>
    issues.filter((i) => i.state === state).map((i) => workflowIssueText(i))
  const general = issues.filter((i) => i.state === undefined).map((i) => workflowIssueText(i))
  const fieldErrors = result !== null && !result.ok ? (result.fieldErrors ?? {}) : {}
  return (
    <form action={run} className="max-w-4xl space-y-4">
      <CsrfField />
      <input type="hidden" name="kind" value="application_type" />
      <input type="hidden" name="key" value={typeKey} />
      <input type="hidden" name="body" value={JSON.stringify(body)} />
      <p className="text-sm">{`Kind of proceeding: ${classification.label}`}</p>
      {EDITABLE.map((state) => (
        <StateSteps
          key={state}
          state={state}
          substeps={workflow.substeps}
          issues={issueText(state)}
          onChange={(substeps) => setWorkflow({ ...workflow, substeps })}
        />
      ))}
      {classification.directIssueAllowed ? (
        <Check
          label="Staff may issue directly at the counter"
          checked={workflow.allowsDirectIssue}
          onChange={(checked) => setWorkflow({ ...workflow, allowsDirectIssue: checked })}
        />
      ) : (
        <p className="text-sm">This kind of proceeding always goes through the board.</p>
      )}
      <Pick
        label="Closes"
        value={workflow.closesOn}
        options={CLOSES_ON}
        onChange={(e) =>
          setWorkflow({ ...workflow, closesOn: e.target.value as Workflow['closesOn'] })
        }
      />
      {general.map((text) => (
        <p key={text} role="alert" className="text-sm text-status-failed-fg">
          {text}
        </p>
      ))}
      <fieldset className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Preview with a sample</legend>
        <Input label="Received on" type="date" name="previewReceived" defaultValue="2027-03-24" />
        <Input label="Accepted on" type="date" name="previewAccepted" defaultValue="2027-04-14" />
        <Input label="Meeting on" type="date" name="previewMeeting" defaultValue="2027-04-14" />
        <Check label="Regional impact" name="previewRegionalImpact" />
      </fieldset>
      <FieldError errors={fieldErrors} name="workflow" />
      <FieldError errors={fieldErrors} name="_form" />
      <PublishBar
        pinned
        disabled={pending || !hydrated}
        status={
          pending ? 'Working' : result === null ? null : result.ok ? result.message : result.error
        }
        extra={
          <Button
            type="submit"
            name="intent"
            value="preview"
            variant="outline"
            disabled={pending || !hydrated}
          >
            Preview
          </Button>
        }
      />
      {preview === null ? null : <WorkflowPreview preview={preview} />}
    </form>
  )
}
