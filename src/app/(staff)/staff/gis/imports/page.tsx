import { desc } from 'drizzle-orm'
import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { ImportUploadForm } from '@/components/staff/ImportUploadForm'
import { NoPermission } from '@/components/staff/NoPermission'
import { gisLayers, importRuns } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import type { RawSearchParams } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { AXISGIS_ADAPTER_STATUS, AXISGIS_STUB_NOTICE } from '@/features/gis/adapters/axisGis'
import { LAYER_KEYS } from '@/features/gis/exceptionKinds'
import { IMPORTS_PATH, RUN_SORT, readRunView, sortRuns } from '@/features/gis/import/runSort'
import { adapterLabel, layerLabel } from '@/features/gis/import/runText'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { getTownSettings } from '@/features/town/settings'
import { formatInstantLong } from '@/lib/formatDate'
import { words } from '@/lib/words'
import { recordStaffContext } from '@/server/requireStaff'
import { updateLayerSettingsAction } from './actions'
import { LayerImportAction } from './LayerImportAction'

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

const CAMA_ADAPTER_OPTIONS = [
  ['', 'None'],
  ['file_cama_csv', 'CAMA CSV file'],
] as const

const adapterStatus: string = AXISGIS_ADAPTER_STATUS
const DEFAULT_ZONE = 'America/New_York'

export default async function StaffImportsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, sort } = readRunView(await searchParams)
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Imports" action="see layer imports" />
  const actor = ctx.actor
  const [canImport, canConfigure] = await Promise.all([
    hasCapability(ctx.db, actor.userId, 'gis.import', ctx.signal),
    hasCapability(ctx.db, actor.userId, 'config.edit', ctx.signal),
  ])
  const layers = await ctx.db.select().from(gisLayers)
  const recentRuns = await ctx.db
    .select()
    .from(importRuns)
    .orderBy(desc(importRuns.startedAt))
    .limit(20)
  const runs = sortRuns(recentRuns, sort)
  const links = sortLinks(IMPORTS_PATH, params, RUN_SORT, sort)
  const now = new Date()
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  const when = (iso: string) => formatInstantLong(new Date(iso), zone)
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
              {key === 'cama' ? 'CAMA' : key}
            </h2>
            <p>
              {STATE_WORDS[status.state]}
              {status.lastSuccessAt === null ? '' : `. Last success ${when(status.lastSuccessAt)}`}
              {status.lastFailureAt === null ? '' : `. Last failure ${when(status.lastFailureAt)}`}
            </p>
            {layer.lastError === null || status.state !== 'import_failed' ? null : (
              <p role="alert">{`Error: ${layer.lastError}`}</p>
            )}
            {layer.adapter === 'axisgis' && adapterStatus === 'stubbed' ? (
              <p className="my-2 rounded-md bg-highlight px-3 py-2 text-sm">
                {AXISGIS_STUB_NOTICE}
              </p>
            ) : null}
            {canImport ? <LayerImportAction layerKey={key} remote={remote} /> : null}
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
                    options={key === 'cama' ? CAMA_ADAPTER_OPTIONS : ADAPTER_OPTIONS}
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
        <div className="table-panel">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr>
                <SortHeader label="Started" link={links.started} />
                <SortHeader label="Layer" link={links.layer} />
                <SortHeader label="Source" link={links.source} />
                <SortHeader label="Status" link={links.status} />
                <th scope="col">
                  <span className="sr-only">Report</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{formatInstantLong(run.startedAt, zone)}</td>
                  <td>{layerLabel(run.layerKey)}</td>
                  <td>{adapterLabel(run.adapter)}</td>
                  <td>{words(run.status)}</td>
                  <td>
                    <Link href={`/staff/gis/imports/${run.id}`} className="text-action underline">
                      Report
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
