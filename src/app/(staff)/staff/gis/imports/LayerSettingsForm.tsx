import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import type { gisLayers } from '@/db/schema'
import { updateLayerSettingsAction } from './actions'

const ADAPTER_OPTIONS = [
  ['', 'None (upload a file)'],
  ['esri_rest', 'Esri REST feature service'],
  ['axisgis', 'AxisGIS'],
] as const

const CAMA_ADAPTER_OPTIONS = [
  ['', 'None'],
  ['file_cama_csv', 'CAMA CSV file'],
] as const

export function LayerSettingsForm({ layer }: { layer: typeof gisLayers.$inferSelect }) {
  return (
    <ActionForm
      action={updateLayerSettingsAction}
      submitLabel="Save settings"
      className="mt-3 max-w-xl"
    >
      <input type="hidden" name="key" value={layer.key} />
      <SelectField
        label="Source"
        name="adapter"
        defaultValue={layer.adapter ?? ''}
        options={layer.key === 'cama' ? CAMA_ADAPTER_OPTIONS : ADAPTER_OPTIONS}
      />
      <TextField label="Source URL" name="sourceUrl" defaultValue={layer.sourceUrl ?? ''} />
      <AreaField
        label="Field mapping (JSON)"
        name="mapping"
        rows={8}
        defaultValue={JSON.stringify(layer.mapping, null, 2)}
      />
      <TextField
        label="Mark stale after (days)"
        name="staleAfterDays"
        type="number"
        min={1}
        defaultValue={layer.staleAfterDays}
      />
      <TextField
        label="Refresh every (hours)"
        name="refreshIntervalHours"
        type="number"
        min={1}
        defaultValue={layer.refreshIntervalHours}
      />
    </ActionForm>
  )
}
