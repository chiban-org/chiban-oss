'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { FormDialog } from '@/components/FormDialog'
import { FormRenderer, type FormValue } from '@/components/forms/FormRenderer'
import { type CheckOutcome, useCorrectionCheck } from '@/components/permits/useCorrectionCheck'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { LICENSE_FIELD } from '@/features/forms/formReferences'
import type { CorrectionFormData } from '@/features/permits/correction/correctionForm'
import type { ActionResult } from '@/server/actionRunner'

export interface CorrectionActions {
  check: (formData: FormData) => Promise<CheckOutcome>
  save: (formData: FormData) => Promise<ActionResult>
}

function contractorOptions(data: CorrectionFormData): [string, string][] {
  return [
    ['keep', data.contractor === null ? 'No contractor listed' : `Keep ${data.contractor.name}`],
    ...data.otherParties.map((p): [string, string] => [p.id, p.label]),
    ['new', 'Add a contractor'],
  ]
}

function CheckLines({ outcome }: { outcome: CheckOutcome | null }) {
  if (outcome === null) return <p className="m-0 text-sm text-muted-foreground">Checking fees</p>
  if (!outcome.ok)
    return <p className="m-0 text-sm font-semibold text-status-failed-fg">{outcome.error}</p>
  const refused = outcome.refusal !== null
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className={refused ? 'm-0 font-semibold text-status-failed-fg' : 'm-0'}>
        {outcome.refusal ?? outcome.feeLine}
      </p>
      <p className="m-0">
        {outcome.notify.length === 0
          ? 'Will notify: no one, because nobody on this permit has an account.'
          : `Will notify: ${outcome.notify.join(', ')}`}
      </p>
    </div>
  )
}

function NotACorrection({ data }: { data: CorrectionFormData }) {
  return (
    <p className="m-0 text-sm text-muted-foreground">
      {
        "Changing the permit type, the parcel, the board's conditions or anything that would change the review is not a correction. "
      }
      {data.amendedHref === null ? (
        `The applicant starts an amended application from their account and names permit ${data.number} in it.`
      ) : (
        <>
          <Link href={data.amendedHref}>Start an amended application</Link>
          {` that names permit ${data.number}.`}
        </>
      )}
    </p>
  )
}

function NewContractor({ name, onName }: { name: string; onName: (next: string) => void }) {
  return (
    <>
      <TextField
        label="New contractor's name"
        name="contractorName"
        value={name}
        onChange={(e) => onName(e.target.value)}
        required
      />
      <TextField
        label="New contractor's email"
        name="contractorEmail"
        type="email"
        hint="Leave blank if not known. Without an account they are not notified."
      />
    </>
  )
}

export function CorrectPermitDialog({
  data,
  actions,
}: {
  data: CorrectionFormData
  actions: CorrectionActions
}) {
  const [values, setValues] = useState<Record<string, unknown>>(data.values)
  const [license, setLicense] = useState(String(data.values[LICENSE_FIELD] ?? ''))
  const [contractor, setContractor] = useState('keep')
  const [newName, setNewName] = useState('')
  const answers = JSON.stringify(
    data.licenseField === null ? values : { ...values, [LICENSE_FIELD]: license },
  )
  const outcome = useCorrectionCheck(actions.check, {
    applicationId: data.applicationId,
    values: answers,
    contractor,
    contractorName: newName,
  })
  const label = `Save and reissue as revision ${data.nextRevision}`
  return (
    <FormDialog
      label="Correct this permit"
      title={`Correct permit ${data.number}`}
      description="Fix the contractor, license number, answers or project title. The permit keeps its number."
    >
      <ActionForm
        action={actions.save}
        submitLabel={label}
        checkBeforeSubmit={() => (outcome?.ok === true ? outcome.refusal : null)}
        confirm={{
          title: `Reissue permit ${data.number} as revision ${data.nextRevision}?`,
          body: 'The permit keeps its number. The current copy stays on file, marked superseded, and the people listed are notified.',
          confirmLabel: label,
          tone: 'default',
        }}
      >
        <input type="hidden" name="applicationId" value={data.applicationId} />
        <input type="hidden" name="values" value={answers} />
        <SelectField
          label="Contractor"
          name="contractor"
          value={contractor}
          onChange={(e) => setContractor(e.target.value)}
          options={contractorOptions(data)}
        />
        {contractor === 'new' ? <NewContractor name={newName} onName={setNewName} /> : null}
        {data.licenseField === null ? null : (
          <TextField
            label={data.licenseField.label}
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            required={data.licenseField.required}
          />
        )}
        <FormRenderer
          form={data.form}
          values={values}
          errors={outcome?.ok === true ? outcome.fieldErrors : {}}
          onChange={(key: string, value: FormValue) =>
            setValues((prev) => ({ ...prev, [key]: value }))
          }
        />
        <TextField
          label="Project title"
          name="projectTitle"
          defaultValue={data.projectTitle}
          required
        />
        <AreaField
          label="Reason for the correction"
          name="reason"
          hint="Kept in the permit's history."
          required
        />
        <CheckLines outcome={outcome} />
        <NotACorrection data={data} />
      </ActionForm>
    </FormDialog>
  )
}
