import { desc } from 'drizzle-orm'
import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { ImportUploadForm } from '@/components/staff/ImportUploadForm'
import { gisLayers, importRuns } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { AXISGIS_ADAPTER_STATUS, AXISGIS_STUB_NOTICE } from '@/features/gis/adapters/axisGis'
import { LAYER_KEYS } from '@/features/gis/exceptionKinds'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { createContext } from '@/server/trpc/context'
import { runLayerRefreshAction, updateLayerSettingsAction } from './actions'

const STATE_WORDS = {
  not_configured: 'Not configured',
  never_imported: 'Never imported',
  import_failed: 'Last import failed',
  stale: 'Stale',
  fresh: 'Fresh',
} as const

const ADAPTER_OPTIONS = [
  ['', 'None (upload a file)'],
  ['esri_rest', 'Esri REST feature service'],
  ['axisgis', 'AxisGIS'],
] as const

const adapterStatus: string = AXISGIS_ADAPTER_STATUS

export default async function StaffImportsPage() {
  const ctx = await createContext()
  const actor = ctx.actor
  if (actor === null) return null
  const [canImport, canConfigure] = await Promise.all([
    hasCapability(ctx.db, actor.userId, 'gis.import', ctx.signal),
    hasCapability(ctx.db, actor.userId, 'config.edit', ctx.signal),
  ])
  const layers = await ctx.db.select().from(gisLayers)
  const runs = await ctx.db.select().from(importRuns).orderBy(desc(importRuns.startedAt)).limit(20)
  const now = new Date()
  const statuses = await Promise.all(
    LAYER_KEYS.map((k) => getLayerStatus(ctx.db, k, now, ctx.signal)),
  )

  return (
    <main>
      <h1>Imports</h1>
      {LAYER_KEYS.map((key, i) => {
        const layer = layers.find((l) => l.key === key)
        const status = statuses[i]
        if (layer === undefined || status === undefined) return null
        const remote = layer.adapter === 'esri_rest' || layer.adapter === 'axisgis'
        return (
          <section
            key={key}
            className="my-6 rounded-lg border bg-surface p-6"
            aria-labelledby={`layer-${key}`}
          >
            <h2 id={`layer-${key}`} className="capitalize">
              {key}
            </h2>
            <p>
              {STATE_WORDS[status.state]}
              {status.lastSuccessAt === null ? '' : `. Last success ${status.lastSuccessAt}`}
              {status.lastFailureAt === null ? '' : `. Last failure ${status.lastFailureAt}`}
            </p>
            {layer.lastError === null || status.state !== 'import_failed' ? null : (
              <p role="alert">{`Error: ${layer.lastError}`}</p>
            )}
            {layer.adapter === 'axisgis' && adapterStatus === 'stubbed' ? (
              <p className="my-2 rounded-md bg-highlight px-3 py-2 text-sm">
                {AXISGIS_STUB_NOTICE}
              </p>
            ) : null}
            {canImport ? (
              remote ? (
                <ActionForm
                  action={runLayerRefreshAction}
                  submitLabel="Run import"
                  variant={key === 'parcels' ? 'default' : 'outline'}
                >
                  <input type="hidden" name="key" value={key} />
                </ActionForm>
              ) : (
                <ImportUploadForm layerKey={key} primary={key === 'parcels'} />
              )
            ) : null}
            {canConfigure ? (
              <details className="mt-4">
                <summary className="cursor-pointer font-medium">Layer settings</summary>
                <ActionForm
                  action={updateLayerSettingsAction}
                  submitLabel="Save settings"
                  className="mt-3 max-w-xl space-y-3"
                >
                  <input type="hidden" name="key" value={key} />
                  <SelectField
                    label="Source"
                    name="adapter"
                    defaultValue={layer.adapter ?? ''}
                    options={ADAPTER_OPTIONS}
                  />
                  <TextField
                    label="Source URL"
                    name="sourceUrl"
                    defaultValue={layer.sourceUrl ?? ''}
                  />
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
              </details>
            ) : null}
          </section>
        )
      })}
      <h2>Recent runs</h2>
      {runs.length === 0 ? (
        <p>No imports have run yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Started</th>
              <th>Layer</th>
              <th>Source</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-b">
                <td className="py-2">{run.startedAt.toISOString()}</td>
                <td>{run.layerKey}</td>
                <td>{run.adapter}</td>
                <td>{run.status}</td>
                <td>
                  <Link href={`/staff/gis/imports/${run.id}`} className="text-action underline">
                    Report
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
