import { eq } from 'drizzle-orm'
import { enforcementCases } from '@/db/schema'
import {
  type EnforcementSeedContext,
  must,
  photoBytes,
} from '@/features/demo/seedEnforcementSupport'
import { setCaseStatus } from '@/features/enforcement/cases'
import { attachComplaintPhotos } from '@/features/enforcement/complaintPhotos'
import { insertComplaintWithCase } from '@/features/enforcement/complaints'
import { recordFinding } from '@/features/enforcement/findings'
import { publishCase, setComplaintPublicText } from '@/features/enforcement/publicText'
import { linkRecordToParcel } from '@/features/parcels/recordLinks'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'

export async function seedPublicCase(ctx: EnforcementSeedContext): Promise<void> {
  const { db, signal, staff } = ctx
  const parcel = must(await resolveParcelId(db, { value: '007001000000' }, signal), 'parcel')
  const photo = { bytes: await photoBytes(40), type: 'image/jpeg' as const }
  const created = await db.transaction(async (tx) => {
    const made = await insertComplaintWithCase(
      tx,
      {
        channel: 'anonymous_web',
        locationText: '12 Heron Cove Road',
        description: 'Somebody is running an auto repair business out of the garage at night.',
        parcelId: parcel.parcelId,
      },
      ctx.now,
      signal,
    )
    await attachComplaintPhotos(
      tx,
      ctx.store,
      { caseId: made.caseId, photos: [photo], actor: { kind: 'anonymous_public_intake' } },
      signal,
    )
    await linkRecordToParcel(
      tx,
      { recordKind: 'enforcement_case', recordId: made.caseId, parcelId: parcel.parcelId },
      signal,
    )
    return made
  })
  await db
    .update(enforcementCases)
    .set({ parcelId: parcel.parcelId })
    .where(eq(enforcementCases.id, created.caseId))
  must(
    await setCaseStatus(
      db,
      staff,
      { caseId: created.caseId, to: 'investigating', expectedRowVersion: 1 },
      signal,
      ctx.now,
    ),
    'investigate the public case',
  )
  must(
    await recordFinding(
      db,
      staff,
      {
        caseId: created.caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: 'Zoning Ordinance Section 7.3, home occupations',
        facts: 'Vehicles are repaired in the garage as a business.',
        inspectionDate: ctx.day(-5),
      },
      signal,
      ctx.now,
    ),
    'finding',
  )
  must(
    await setComplaintPublicText(
      db,
      staff,
      {
        complaintId: created.complaintId,
        text: 'A business is reported to be operating from a residential garage.',
      },
      signal,
      ctx.now,
    ),
    'public text',
  )
  must(
    await publishCase(
      db,
      staff,
      { caseId: created.caseId, summary: 'A possible unpermitted home business is under review.' },
      signal,
    ),
    'publish',
  )
}
