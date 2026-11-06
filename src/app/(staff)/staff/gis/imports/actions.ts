'use server'

import { updateLayerSettings } from '@/features/gis/layerSettings'
import { refreshLayer } from '@/features/gis/refreshLayer'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { LAYER_SETTINGS_FORM, REFRESH_FORM } from './gisForms'

const COPY = {
  invalid_settings: 'Check the adapter, source URL, and numbers.',
  invalid_mapping: 'The mapping is not valid JSON for this layer.',
  owner_source_conflict:
    'Owner name and mailing address come from the CAMA file. Remove them from the parcels mapping.',
} as const

export async function updateLayerSettingsAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, LAYER_SETTINGS_FORM, async ({ db, actor, signal }, input) => {
    const result = await updateLayerSettings(
      db,
      actor,
      { ...input, mapping: input.mapping ?? '' },
      signal,
    )
    if (result.ok) return { ok: true, message: 'Layer settings saved.' }
    if (result.error === 'forbidden') return { ok: false, error: errorCopy('forbidden') }
    return result.error === 'invalid_settings'
      ? { ok: false, error: COPY.invalid_settings }
      : refuseField('mapping', COPY[result.error])
  })
}

const IMPORT_COPY = {
  forbidden: 'You do not have permission to do this.',
  import_in_progress: 'Another import of this layer is running. Try again in a moment.',
  layer_not_configured: 'Set an Esri or AxisGIS adapter and a source URL first, or upload a file.',
  invalid_mapping: 'The layer mapping is not valid. Fix it in the layer settings.',
  import_failed: 'The import failed. The details are on the layer card.',
} as const

export async function runLayerRefreshAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, REFRESH_FORM, async ({ db, actor, signal }, input) => {
    const result = await refreshLayer(
      db,
      { kind: 'user', userId: actor.userId },
      input.key,
      { fetch },
      signal,
    )
    if (!result.ok) return { ok: false, error: IMPORT_COPY[result.error] }
    const r = result.value
    return {
      ok: true,
      message: `Imported ${r.countIn} rows: ${r.countCreated} created, ${r.countApplied} applied, ${r.countUnchanged} unchanged, ${r.countExcepted} excepted.`,
    }
  })
}
