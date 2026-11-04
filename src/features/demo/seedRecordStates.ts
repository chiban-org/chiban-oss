import { eq, isNotNull } from 'drizzle-orm'
import { dispositionBatches, legalHolds } from '@/db/schema'
import type { CoverageContext } from '@/features/demo/seedCoverage'
import { caseWithPhoto } from '@/features/demo/seedDisposition'
import { actorFor, findApplication, must } from '@/features/demo/seedPermitSupport'
import type { RtkSeedContext } from '@/features/demo/seedRtk'
import { proposeDisposition } from '@/features/disposition/propose'
import { placeHold, releaseHold } from '@/features/records/holds'
import { recordRetentionEvent } from '@/features/records/recordEvents'
import { addDays } from '@/types/civilDate'

const EVENT_DAYS_AGO = 400
const PROPOSAL_DAYS_AGO = 60

async function releasedHold(ctx: CoverageContext): Promise<boolean> {
  const [released] = await ctx.db
    .select({ id: legalHolds.id })
    .from(legalHolds)
    .where(isNotNull(legalHolds.releasedAt))
    .limit(1)
  if (released !== undefined) return false
  const applicationId = await findApplication(ctx.db, 'Service upgrade')
  if (applicationId === null) return false
  const custodian = await actorFor(ctx.db, 'records', ctx.signal)
  const placed = must(
    await placeHold(
      ctx.db,
      custodian,
      {
        target: { kind: 'application', id: applicationId },
        reason: 'Hold while the insurer reviews the panel fire claim',
      },
      ctx.signal,
    ),
    'hold to release',
  )
  must(
    await releaseHold(
      ctx.db,
      custodian,
      { holdId: placed.holdId, reason: 'The insurer closed the claim without asking for records' },
      ctx.signal,
    ),
    'release hold',
  )
  return true
}

async function proposedBatch(ctx: CoverageContext): Promise<boolean> {
  const [proposed] = await ctx.db
    .select({ id: dispositionBatches.id })
    .from(dispositionBatches)
    .where(eq(dispositionBatches.status, 'proposed'))
    .limit(1)
  if (proposed !== undefined) return false
  const records: RtkSeedContext = {
    db: ctx.db,
    store: ctx.store,
    signal: ctx.signal,
    now: ctx.now,
    today: ctx.today,
    staff: ctx.cast.staff,
    custodian: await actorFor(ctx.db, 'records', ctx.signal),
  }
  const settled = await caseWithPhoto(records, 'Birch Lane', 'Settled complaint photo log')
  must(
    await recordRetentionEvent(
      ctx.db,
      ctx.cast.staff,
      {
        target: { caseId: settled.caseId },
        kind: 'appeal_period_expired',
        occurredOn: addDays(ctx.today, -EVENT_DAYS_AGO),
      },
      ctx.signal,
      ctx.now,
    ),
    'appeal period for the batch waiting on approval',
  )
  must(
    await proposeDisposition(
      ctx.db,
      ctx.cast.staff,
      { asOf: addDays(ctx.today, -PROPOSAL_DAYS_AGO) },
      ctx.signal,
      ctx.now,
    ),
    'propose a batch for approval',
  )
  return true
}

export async function seedRecordStates(ctx: CoverageContext): Promise<boolean> {
  const steps = [await releasedHold(ctx), await proposedBatch(ctx)]
  return steps.some(Boolean)
}
