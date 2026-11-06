import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { CENSUS_EXCLUDED_REASONS } from '@/db/schema'
import {
  CENSUS_CATEGORY_LABELS,
  CENSUS_PHASE_LABELS,
  CENSUS_REASON_LABELS,
} from '@/features/census/labels'
import type { CensusSuggestion } from '@/features/census/suggest'
import { classifyCensusAction } from './actions'

export function ClassifyForm({
  applicationId,
  suggestion,
}: {
  applicationId: string
  suggestion: CensusSuggestion
}) {
  return (
    <ActionForm action={classifyCensusAction} submitLabel="Save classification">
      <input type="hidden" name="applicationId" value={applicationId} />
      <SelectField
        label="Kind of structure"
        name="category"
        defaultValue={suggestion.category}
        options={Object.entries<string>(CENSUS_CATEGORY_LABELS)}
      />
      <SelectField
        label="If left out of the count, why"
        name="excludedReason"
        defaultValue={suggestion.excludedReason ?? ''}
        options={[
          ['', 'Not left out'],
          ...CENSUS_EXCLUDED_REASONS.map((x) => [x, CENSUS_REASON_LABELS[x]] as [string, string]),
        ]}
      />
      <SelectField
        label="Phase"
        name="phase"
        defaultValue={suggestion.phase}
        options={Object.entries<string>(CENSUS_PHASE_LABELS)}
      />
      <TextField
        label="Buildings"
        name="buildings"
        type="number"
        min="0"
        defaultValue={suggestion.buildings}
        required
      />
      <TextField
        label="Housing units"
        name="housingUnits"
        type="number"
        min="0"
        defaultValue={suggestion.housingUnits}
        required
      />
      <TextField
        label="Valuation in whole dollars"
        name="valuationDollars"
        type="number"
        min="0"
        defaultValue={suggestion.valuationDollars}
        required
      />
    </ActionForm>
  )
}
