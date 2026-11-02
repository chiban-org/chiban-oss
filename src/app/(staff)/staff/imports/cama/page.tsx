import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { gisLayers, importRuns, parcelIdFormats } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import {
  CAMA_ADAPTER_STATUS,
  CAMA_STUB_NOTICE,
  camaMappingSchema,
  DEFAULT_CAMA_COLUMNS,
  DEFAULT_CAMA_MAPPING,
} from '@/features/cama/mapping'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { getTownSettings } from '@/features/town/settings'
import { formatInstantLong } from '@/lib/formatDate'
import { words } from '@/lib/words'
import { requireStaffContext } from '@/server/requireStaff'
import { CamaImportPanel } from './CamaImportPanel'

export const dynamic = 'force-dynamic'

const DEFAULT_ZONE = 'America/New_York'
const RECENT_RUNS = 5
const adapterStatus: string = CAMA_ADAPTER_STATUS

const STATE_WORDS = {
  not_configured: 'Not configured',
  never_imported: 'Never imported',
  import_failed: 'Last import failed',
  stale: 'Stale',
  fresh: 'Fresh',
} as const

export default async function CamaImportPage() {
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'gis.import', ctx.signal))) {
    return (
      <main>
        <h1>CAMA owner import</h1>
        <p role="alert">You do not have permission to run imports.</p>
      </main>
    )
  }
  const [layer] = await ctx.db.select().from(gisLayers).where(eq(gisLayers.key, 'cama'))
  const status = await getLayerStatus(ctx.db, 'cama', new Date(), ctx.signal)
  const runs = await ctx.db
    .select()
    .from(importRuns)
    .where(eq(importRuns.layerKey, 'cama'))
    .orderBy(desc(importRuns.startedAt))
    .limit(RECENT_RUNS)
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  const formats = await ctx.db
    .select({ key: parcelIdFormats.key, label: parcelIdFormats.label })
    .from(parcelIdFormats)
  const saved = camaMappingSchema.safeParse(layer?.mapping)
  return (
    <main>
      <h1>CAMA owner import</h1>
      {adapterStatus === 'stubbed' ? (
        <div role="note" className="my-3 rounded-md bg-highlight px-3 py-2 text-sm">
          <p>{CAMA_STUB_NOTICE}</p>
        </div>
      ) : null}
      <p>
        {STATE_WORDS[status.state]}
        {status.lastSuccessAt === null
          ? ''
          : `. Last success ${formatInstantLong(new Date(status.lastSuccessAt), zone)}`}
        {status.lastFailureAt === null
          ? ''
          : `. Last failure ${formatInstantLong(new Date(status.lastFailureAt), zone)}`}
        .
      </p>
      <p>
        Owner names and mailing addresses come from this file. Parcels are never created here, and a
        changed owner or mailing address is held in the{' '}
        <Link href="/staff/gis/exceptions?kind=owner_changed" className="text-action underline">
          exception queue
        </Link>{' '}
        until someone accepts it.
      </p>
      <h2>Chiban CAMA CSV v1 layout</h2>
      <p>{`The default layout has these columns, in this order: ${DEFAULT_CAMA_COLUMNS.join(', ')}.`}</p>
      <CamaImportPanel
        saved={saved.success ? saved.data : DEFAULT_CAMA_MAPPING}
        formats={formats}
      />
      <h2>Recent runs</h2>
      {runs.length === 0 ? (
        <p>No CAMA imports have run yet.</p>
      ) : (
        <ul>
          {runs.map((run) => (
            <li key={run.id}>
              <Link href={`/staff/gis/imports/${run.id}`} className="text-action underline">
                {`${formatInstantLong(run.startedAt, zone)}, ${words(run.status)}`}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href="/staff/gis/imports" className="text-action underline">
          Back to Imports
        </Link>
      </p>
    </main>
  )
}
