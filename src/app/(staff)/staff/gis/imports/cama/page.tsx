import { desc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { PracticeNotice } from '@/components/PracticeNotice'
import { NoIdFormatsNotice } from '@/components/parcels/NoIdFormatsNotice'
import { NoPermission } from '@/components/staff/NoPermission'
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

export const metadata: Metadata = { title: 'CAMA owner import' }

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
    return <NoPermission title="CAMA owner import" action="run imports" />
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
  const canEditSettings = await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal)
  const saved = camaMappingSchema.safeParse(layer?.mapping)
  return (
    <main>
      <PageHeader
        kicker={<Link href="/staff/gis/imports">Imports</Link>}
        title="CAMA owner import"
        lead={
          <>
            Owner names and mailing addresses come from this file. Parcels are never created here,
            and a changed owner or mailing address is held in the{' '}
            <Link href="/staff/gis/exceptions?kind=owner_changed">exception queue</Link> until
            someone accepts it.
          </>
        }
      />
      {formats.length === 0 ? <NoIdFormatsNotice canEdit={canEditSettings} /> : null}
      {adapterStatus === 'stubbed' ? <PracticeNotice>{CAMA_STUB_NOTICE}</PracticeNotice> : null}
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
      <section aria-labelledby="cama-layout">
        <h2 id="cama-layout">Chiban CAMA CSV v1 layout</h2>
        <p>{`The default layout has these columns, in this order: ${DEFAULT_CAMA_COLUMNS.join(', ')}.`}</p>
        <CamaImportPanel
          saved={saved.success ? saved.data : DEFAULT_CAMA_MAPPING}
          formats={formats}
        />
      </section>
      <section aria-labelledby="cama-runs">
        <h2 id="cama-runs">Recent runs</h2>
        {runs.length === 0 ? (
          <p>No CAMA imports have run yet.</p>
        ) : (
          <ul>
            {runs.map((run) => (
              <li key={run.id}>
                <Link href={`/staff/gis/imports/${run.id}`}>
                  {`${formatInstantLong(run.startedAt, zone)}, ${words(run.status)}`}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
