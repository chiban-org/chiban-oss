import { NH_LICENSE_TYPES } from '@packs/nh/licenseTypes'
import { NH_LICENSE_LOOKUP } from '@packs/nh/links'
import { ActionForm } from '@/components/ActionForm'
import { LicenseTypeField } from '@/components/counter/LicenseTypeField'
import { NEW_TAB } from '@/components/newTab'
import { StatusChip } from '@/components/StatusChip'
import { SelectField, TextField } from '@/components/staff/fields'
import type {
  LatestLicenseCheck,
  LicenseCheckPanelData,
} from '@/features/licenseChecks/licenseCheckPanel'
import { LICENSE_RESULT_LABELS } from '@/features/licenseChecks/licenseRules'
import { recordLicenseCheckAction } from './licenseActions'

const LICENSE_GROUPS = NH_LICENSE_TYPES.map((group) => ({
  label: group.label,
  licenses: group.licenses,
}))

const RESULT_OPTIONS: readonly (readonly [string, string])[] = [
  ['', 'Choose a result'],
  ...Object.entries(LICENSE_RESULT_LABELS),
]

function LookupLink() {
  return (
    <a href={NH_LICENSE_LOOKUP.url} {...NEW_TAB} className="self-start">
      {`Open the ${NH_LICENSE_LOOKUP.label}`}
    </a>
  )
}

export function LicenseCheckForm({
  data,
  variant = 'outline',
  lookup = true,
}: {
  data: LicenseCheckPanelData
  variant?: 'default' | 'outline'
  lookup?: boolean
}) {
  return (
    <ActionForm
      action={recordLicenseCheckAction}
      submitLabel="Record the license check"
      variant={variant}
    >
      <input type="hidden" name="applicationId" value={data.applicationId} />
      {lookup ? <LookupLink /> : null}
      <TextField
        label="License number"
        name="licenseNumber"
        defaultValue={data.enteredNumber ?? ''}
        required
      />
      <LicenseTypeField groups={LICENSE_GROUPS} defaultValue={data.defaultType} />
      <SelectField
        label="Result of the state lookup"
        name="result"
        required
        options={RESULT_OPTIONS}
      />
      <TextField label="Note" name="note" />
    </ActionForm>
  )
}

function LatestCheck({ latest }: { latest: LatestLicenseCheck }) {
  return (
    <div className="flex flex-col gap-1 [&>p]:m-0">
      <p className="flex flex-wrap items-center gap-2">
        <StatusChip
          status={latest.result === 'active' ? 'passed' : 'failed'}
          label={latest.resultLabel}
        />
        <span>{`${latest.resultLabel}: license ${latest.licenseNumber}, ${latest.licenseType}.`}</span>
      </p>
      <p>{`Checked by ${latest.checkedBy} on ${latest.checkedOn}.`}</p>
      {latest.note === null ? null : <p>{latest.note}</p>}
      {latest.result === 'active' ? null : (
        <p>The permit cannot be issued until a check finds the license active.</p>
      )}
    </div>
  )
}

export function LicenseCheckPanel({
  data,
  formElsewhere = false,
}: {
  data: LicenseCheckPanelData
  formElsewhere?: boolean
}) {
  return (
    <section aria-label="State license check" id="license-check">
      <h2>State license check</h2>
      <p>
        {data.enteredNumber === null
          ? 'The applicant did not enter a license number.'
          : `The applicant entered license number ${data.enteredNumber}.`}
      </p>
      {data.latest === null ? (
        <p>No state license check is recorded.</p>
      ) : (
        <LatestCheck latest={data.latest} />
      )}
      <p>
        <LookupLink />
      </p>
      {formElsewhere || !data.canRecord ? null : (
        <details>
          <summary>{data.latest === null ? 'Record the license check' : 'Check again'}</summary>
          <LicenseCheckForm data={data} lookup={false} />
        </details>
      )}
    </section>
  )
}
