'use server'

import { updateLayerSettings } from '@/features/gis/layerSettings'
import { refreshLayer } from '@/features/gis/refreshLayer'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'

const COPY = {
  invalid_settings: 'Check the adapter, source URL, and numbers.',
  invalid_mapping: 'The mapping is not valid JSON for this layer.',
  owner_source_conflict:
    'Owner name and mailing address come from the CAMA file. Remove them from the parcels mapping.',
} as const

export async function updateLayerSettingsAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const adapter = text(formData, 'adapter')
    const sourceUrl = text(formData, 'sourceUrl')
    const result = await updateLayerSettings(
      db,
      actor,
      {
        key: text(formData, 'key') as 'parcels',
        adapter: adapter === '' ? null : (adapter as 'esri_rest'),
        sourceUrl: sourceUrl === '' ? null : sourceUrl,
        mapping: text(formData, 'mapping'),
        staleAfterDays: Number(text(formData, 'staleAfterDays')),
        refreshIntervalHours: Number(text(formData, 'refreshIntervalHours')),
      },
      signal,
    )
    if (result.ok) return { ok: true, message: 'Layer settings saved.' }
    return {
      ok: false,
      error: result.error === 'forbidden' ? errorCopy('forbidden') : COPY[result.error],
    }
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
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const key = text(formData, 'key')
    if (key !== 'parcels' && key !== 'roads' && key !== 'water')
      return { ok: false, error: errorCopy('invalid_input') }
    const result = await refreshLayer(
      db,
      { kind: 'user', userId: actor.userId },
      key,
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
