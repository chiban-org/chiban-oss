import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { applications, parcels, projectParties, projects, users } from '@/db/schema'
import { allLayerStatuses } from '@/features/abutters/layerUse'
import type { Provenance, Recipient, ResolverInput } from '@/features/abutters/resolution'
import type { IncompleteReason } from '@/features/abutters/types'
import { formApplicantName, namedParty } from '@/features/applications/applicantName'
import { getTownSettings } from '@/features/town/settings'
import { todayInTimeZone } from '@/types/civilDate'

const FALLBACK_TIME_ZONE = 'UTC'
const FORM_ADDRESS_FIELD = 'applicant_mailing_address'

type RecipientParts = Pick<Recipient, 'roles' | 'parcelIds' | 'provenance'>

function blank(text: string | null): boolean {
  return text === null || text.trim() === ''
}

function recipient(name: string | null, address: string | null, parts: RecipientParts): Recipient {
  const cleanName = name?.trim() ?? ''
  const cleanAddress = address?.trim() ?? ''
  return {
    key: '',
    name: cleanName,
    mailingAddress: cleanAddress === '' ? null : cleanAddress,
    channelHint: 'verified_mail',
    status: cleanName !== '' && cleanAddress !== '' ? 'ok' : 'incomplete_data',
    ...parts,
  }
}

async function parcelProvenance(
  tx: Tx,
  input: ResolverInput,
  signal: AbortSignal,
): Promise<(parcelId: string) => Provenance> {
  const town = await getTownSettings(tx, signal)
  const timeZone = town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE
  const layer = (await allLayerStatuses(tx, input.now, signal)).parcels
  const asOf =
    layer.lastSuccessAt === null ? null : todayInTimeZone(timeZone, new Date(layer.lastSuccessAt))
  return (parcelId) => ({
    source: 'parcel_record',
    ref: parcelId,
    asOf,
    ageDays: layer.ageDays,
    state: layer.state === 'stale' ? 'stale' : 'fresh',
  })
}

export async function resolveOwners(
  tx: Tx,
  input: ResolverInput,
  incomplete: IncompleteReason[],
  signal: AbortSignal,
): Promise<Recipient[]> {
  signal.throwIfAborted()
  const ids = input.candidates.map((c) => c.parcelId)
  if (ids.length === 0) return []
  const rows = await tx
    .select({ id: parcels.id, owner: parcels.ownerName, address: parcels.mailingAddress })
    .from(parcels)
    .where(inArray(parcels.id, ids))
  const byId = new Map(rows.map((r) => [r.id, r]))
  const provenance = await parcelProvenance(tx, input, signal)
  return ids.flatMap((id) => {
    const row = byId.get(id)
    if (row === undefined) return []
    if (blank(row.owner)) {
      incomplete.push({
        code: 'owner_missing',
        detail: 'The parcel record has no owner name.',
        parcelId: id,
      })
    } else if (blank(row.address)) {
      incomplete.push({
        code: 'address_missing',
        detail: `The parcel record has no mailing address for ${row.owner ?? ''}.`,
        parcelId: id,
      })
    }
    return [
      recipient(row.owner, row.address, {
        roles: ['abutter_owner'],
        parcelIds: [id],
        provenance: [provenance(id)],
      }),
    ]
  })
}

async function applicationValues(db: DbOrTx, applicationId: string) {
  const [row] = await db
    .select({ values: applications.values })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return (row?.values ?? {}) as Record<string, unknown>
}

async function applicantName(
  db: DbOrTx,
  applicationId: string,
  values: Record<string, unknown>,
): Promise<string | null> {
  const [row] = await db
    .select({ name: projectParties.name, displayName: users.displayName })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .innerJoin(projectParties, eq(projectParties.projectId, projects.id))
    .leftJoin(users, eq(users.id, projectParties.userId))
    .where(
      and(
        eq(applications.id, applicationId),
        eq(projectParties.role, 'applicant'),
        sql`${projectParties.removedAt} is null`,
      ),
    )
    .orderBy(asc(projectParties.addedAt))
    .limit(1)
  const fromForm = formApplicantName(values)
  if (row === undefined) return fromForm
  return fromForm ?? namedParty(row.name) ?? row.displayName ?? null
}

export async function resolveApplicant(
  tx: Tx,
  input: ResolverInput,
  incomplete: IncompleteReason[],
  signal: AbortSignal,
): Promise<Recipient[]> {
  signal.throwIfAborted()
  const values = await applicationValues(tx, input.applicationId)
  const address = new Map(Object.entries(values)).get(FORM_ADDRESS_FIELD)
  const entry = recipient(
    await applicantName(tx, input.applicationId, values),
    typeof address === 'string' ? address : null,
    {
      roles: ['applicant'],
      parcelIds: [],
      provenance: [
        {
          source: 'application_form',
          ref: input.applicationId,
          asOf: null,
          ageDays: null,
          state: 'entered',
        },
      ],
    },
  )
  if (entry.status === 'incomplete_data') {
    incomplete.push({
      role: 'applicant',
      code: entry.name === '' ? 'owner_missing' : 'address_missing',
      detail:
        entry.name === ''
          ? 'The application has no applicant name on record.'
          : 'The application has no applicant mailing address.',
    })
  }
  return [entry]
}
