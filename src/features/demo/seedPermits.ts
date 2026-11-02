import { NH_STARTERS } from '@packs/nh/starters'
import { like } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { projects } from '@/db/schema'
import { recordAppeal } from '@/features/appeals/appeals'
import {
  recordRegionalImpactDetermination,
  recordRegionalImpactNotice,
} from '@/features/building/regionalImpact'
import { renewPermit } from '@/features/building/renewal'
import { adoptStarter } from '@/features/config/adoptStarter'
import {
  actorFor,
  BUILDING_VALUES,
  type Cast,
  completeAndReview,
  d,
  must,
  open,
  readyToIssue,
  TITLE_PREFIX,
  TRADE_VALUES,
} from '@/features/demo/seedPermitSupport'
import { createFeeOverride } from '@/features/fees/feeOverrides'

export async function seedPermits(db: Db, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(like(projects.title, `${TITLE_PREFIX}%`))
    .limit(1)
  if (existing.length > 0) return false
  const cast: Cast = {
    admin: await actorFor(db, 'admin', signal),
    staff: await actorFor(db, 'staff', signal),
    applicant: await actorFor(db, 'applicant', signal),
  }
  for (const starter of NH_STARTERS) {
    const adopted = await adoptStarter(db, cast.admin, starter.id, signal)
    if (!adopted.ok && adopted.error !== 'already_adopted') must(adopted, `adopt ${starter.id}`)
  }

  const inReview = await open(db, cast, signal, {
    parcel: '007001000000',
    title: 'Addition under review',
    typeKey: 'BP',
    values: BUILDING_VALUES,
    submittedOn: '2027-05-10',
  })
  await completeAndReview(inReview, '2027-05-12', '2027-05-13')
  must(
    await createFeeOverride(
      db,
      cast.admin,
      {
        applicationId: inReview.applicationId,
        feeCode: 'building',
        kind: 'waive',
        reason: 'Fee waived for a town-sponsored project',
      },
      signal,
    ),
    'fee waiver',
  )

  const regional = await open(db, cast, signal, {
    parcel: '007002000000',
    title: 'Lodge with regional impact',
    typeKey: 'BP',
    values: { ...BUILDING_VALUES, classification: 'nonresidential', commercial_sq_ft: '5200' },
    submittedOn: '2027-05-20',
  })
  await completeAndReview(regional, '2027-05-21', '2027-05-22')
  must(
    await recordRegionalImpactDetermination(
      db,
      cast.staff,
      {
        applicationId: regional.applicationId,
        determination: 'yes',
        determinedOn: d('2027-05-25'),
      },
      signal,
    ),
    'determination',
  )
  must(
    await recordRegionalImpactNotice(
      db,
      cast.staff,
      {
        applicationId: regional.applicationId,
        recipientKind: 'regional_planning_commission',
        recipientName: 'Alder Pond Regional Planning Commission',
        method: 'certified_mail',
        mailedOn: d('2027-05-26'),
        reference: 'CM-0042',
      },
      signal,
    ),
    'notice',
  )

  const trade = await open(db, cast, signal, {
    parcel: '007003000000',
    title: 'Service upgrade',
    typeKey: 'EL',
    values: TRADE_VALUES,
    submittedOn: '2027-05-15',
  })
  await trade.step('issued', '2027-05-15')

  const appealed = await open(db, cast, signal, {
    parcel: '007004000000',
    title: 'Barn conversion under appeal',
    typeKey: 'BP',
    values: BUILDING_VALUES,
    submittedOn: '2027-03-01',
  })
  await completeAndReview(appealed, '2027-03-02', '2027-03-03')
  await readyToIssue(appealed, '2027-03-20')
  await appealed.step('issued', '2027-04-01')
  must(
    await recordAppeal(
      db,
      cast.staff,
      {
        applicationId: appealed.applicationId,
        filedOn: d('2027-05-01'),
        appellantName: 'Abutter at 12 Pond Road',
      },
      signal,
    ),
    'appeal',
  )

  const renewed = await open(db, cast, signal, {
    parcel: '007006000000',
    title: 'Deck renewed once',
    typeKey: 'BP',
    values: BUILDING_VALUES,
    submittedOn: '2026-05-20',
  })
  await completeAndReview(renewed, '2026-05-21', '2026-05-22')
  await readyToIssue(renewed, '2026-06-05')
  await renewed.step('issued', '2026-06-10')
  must(
    await renewPermit(
      db,
      cast.staff,
      { applicationId: renewed.applicationId, renewedOn: d('2027-05-28') },
      signal,
    ),
    'renewal',
  )
  return true
}
