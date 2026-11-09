import type { Metadata } from 'next'
import Link from 'next/link'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { NoIdFormatsNotice } from '@/components/parcels/NoIdFormatsNotice'
import { StatusChip } from '@/components/StatusChip'
import { ImportUploadForm } from '@/components/staff/ImportUploadForm'
import { NoPermission } from '@/components/staff/NoPermission'
import { gisLayers, type importRuns } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import type { RawSearchParams } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import type { Status } from '@/features/design/tokens'
import { AXISGIS_ADAPTER_STATUS, AXISGIS_STUB_NOTICE } from '@/features/gis/adapters/axisGis'
import { LAYER_KEYS } from '@/features/gis/exceptionKinds'
import {
  IMPORTS_PATH,
  listRecentRuns,
  RECENT_RUN_LIMIT,
  RUN_SORT,
  readRunView,
} from '@/features/gis/import/runSort'
import { adapterLabel, layerLabel } from '@/features/gis/import/runText'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { hasIdFormats } from '@/features/parcels/idFormatCopy'
import { getTownSettings } from '@/features/town/settings'
import { formatInstantLong } from '@/lib/formatDate'
import { words } from '@/lib/words'
import { recordStaffContext } from '@/server/requireStaff'
import { LayerImportAction } from './LayerImportAction'
import { LayerSettingsForm } from './LayerSettingsForm'

export const metadata: Metadata = { title: 'Imports' }

const STATE_WORDS = {
  not_configured: 'Not configured',
  never_imported: 'Never imported',
  import_failed: 'Last import failed',
  stale: 'Stale',
  fresh: 'Fresh',
} as const

const adapterStatus: string = AXISGIS_ADAPTER_STATUS
const DEFAULT_ZONE = 'America/New_York'
const RUN_CHIP: Record<(typeof importRuns.$inferSelect)['status'], Status> = {
  running: 'neutral',
  succeeded: 'passed',
  failed: 'failed',
}

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
  const runs = await listRecentRuns(ctx.db, sort, ctx.signal)
  const links = sortLinks(IMPORTS_PATH, params, RUN_SORT, sort)
  const now = new Date()
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  const when = (iso: string) => formatInstantLong(new Date(iso), zone)
  const statuses = await Promise.all(
    LAYER_KEYS.map((k) => getLayerStatus(ctx.db, k, now, ctx.signal)),
  )

  return (
    <main data-wide="">
      <h1>Imports</h1>
      {canImport && !(await hasIdFormats(ctx.db)) ? (
        <NoIdFormatsNotice canEdit={canConfigure} />
      ) : null}
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
                <LayerSettingsForm layer={layer} />
              </details>
            ) : null}
          </section>
        )
      })}
      <h2>Recent runs</h2>
      {runs.length === 0 ? (
        <p>No imports have run yet.</p>
      ) : (
        <>
          <p className="text-muted-foreground">{`Newest first, up to ${RECENT_RUN_LIMIT} runs. Open a run to see its report.`}</p>
          <div className="table-panel">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr>
                  <SortHeader label="Started" link={links.started} />
                  <SortHeader label="Layer" link={links.layer} />
                  <SortHeader label="Source" link={links.source} />
                  <SortHeader label="Status" link={links.status} />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <Link href={`/staff/gis/imports/${run.id}`}>
                        {formatInstantLong(run.startedAt, zone)}
                      </Link>
                    </td>
                    <td>{layerLabel(run.layerKey)}</td>
                    <td>{adapterLabel(run.adapter)}</td>
                    <td>
                      <StatusChip status={RUN_CHIP[run.status]} label={words(run.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
