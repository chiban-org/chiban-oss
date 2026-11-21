import { ActionForm } from '@/components/ActionForm'
import { GroupFieldError } from '@/components/fieldErrors'
import { CheckField, SelectField } from '@/components/staff/fields'
import type { ReceiptPanel } from '@/features/boards/receiptPanel'
import {
  applicationMunicipalitiesAction,
  sourceWaterDeterminationAction,
} from '../../boards/receiptActions'

export function SourceWaterForm({ data }: { data: ReceiptPanel }) {
  const { sourceWater } = data
  return (
    <ActionForm
      action={sourceWaterDeterminationAction}
      submitLabel="Record determination"
      className="max-w-md"
    >
      <input type="hidden" name="applicationId" value={data.applicationId} />
      <SelectField
        label="Source water protection area"
        name="determination"
        defaultValue={sourceWater.determination}
        required
        options={[
          ['', 'Choose a determination'],
          ['within', 'Within a source water protection area'],
          ['not_within', 'Not within a source water protection area'],
        ]}
      />
      <SelectField
        label="Water supplier"
        name="supplierKey"
        defaultValue={sourceWater.supplierKey}
        hint="Needed when the project is within the area."
        options={[
          ['', 'No supplier'],
          ...sourceWater.suppliers.map((s): [string, string] => [s.key, s.name]),
        ]}
      />
    </ActionForm>
  )
}

export function MunicipalitiesForm({ data }: { data: ReceiptPanel }) {
  const { municipalities } = data
  return (
    <ActionForm
      action={applicationMunicipalitiesAction}
      submitLabel="Record municipalities"
      className="max-w-md"
    >
      <input type="hidden" name="applicationId" value={data.applicationId} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Abutting municipalities</legend>
        {municipalities.options.map((o) => (
          <CheckField
            key={o.key}
            label={o.name}
            name="abuttingKeys"
            groupMember
            value={o.key}
            defaultChecked={municipalities.abutting.includes(o.key)}
          />
        ))}
        <GroupFieldError name="abuttingKeys" />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Municipalities the project includes</legend>
        {municipalities.options.map((o) => (
          <CheckField
            key={o.key}
            label={o.name}
            name="includedKeys"
            groupMember
            value={o.key}
            defaultChecked={municipalities.included.includes(o.key)}
          />
        ))}
        <GroupFieldError name="includedKeys" />
      </fieldset>
    </ActionForm>
  )
}
