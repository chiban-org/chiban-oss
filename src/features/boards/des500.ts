import type { ProximityRule } from '@packs/nh/schema'
import { sql } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db, DbOrTx } from '@/db/client'
import { desProximityDeterminations } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { uuidArray } from '@/db/uuidList'
import { applicantParcelIds } from '@/features/abutters/applicantParcels'
import { proximityVerdict } from '@/features/abutters/proximityRule'
import { flagIssuedListStale } from '@/features/abutters/staleList'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { type HonestValue, honestFromLayer } from '@/features/honest/honest'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { mayManageAbutters } from '@/features/rosters/manage'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export const DES_RULE_KEY = 'nh.pb.des_500ft'
const MIN_REASON_LENGTH = 10

export type DesSuggestion = HonestValue<{ within: boolean; withinFt: number | null }>

export function desRule(): ProximityRule {
  const rule = ruleByKey(loadPack(), DES_RULE_KEY)
  if (rule.kind !== 'proximity') {
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'nh.pb.des_500ft must be a proximity rule')
  }
  return rule
}

export async function suggestDesProximity(
  db: DbOrTx,
  applicationId: string,
  now: Date,
  signal: AbortSignal,
): Promise<DesSuggestion> {
  signal.throwIfAborted()
  const rule = desRule()
  const status = await getLayerStatus(db, rule.layer, now, signal)
  if (status.state === 'not_configured') return { state: 'unknown' }
  const parcelIds = await applicantParcelIds(db, applicationId, signal)
  if (parcelIds.length === 0) return { state: 'unknown' }
  const result = await db.execute<{ feet: number | null }>(sql`
    select min(ST_Distance(ST_Transform(p.geom, 3437), ST_Transform(w.geom, 3437)))::float8 as feet
    from parcels p
    cross join gis_features w
    where p.id = any(${uuidArray(parcelIds)})
      and p.geom is not null
      and w.layer_key = ${rule.layer}
  `)
  const feet = result.rows[0]?.feet ?? null
  const verdict = proximityVerdict(rule, feet)
  return honestFromLayer(status, { within: verdict.within, withinFt: feet })
}

export type DesDetermination = 'within_500ft' | 'not_within' | 'not_applicable'

function needsReason(determination: DesDetermination, suggestion: DesSuggestion): boolean {
  if (determination === 'not_applicable') return true
  if (determination === 'within_500ft') return false
  const known =
    (suggestion.state === 'known' || suggestion.state === 'stale') && !suggestion.value.within
  return !known
}

export async function recordDesDetermination(
  db: Db,
  actor: Actor,
  input: { applicationId: string; determination: DesDetermination; reason: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, 'forbidden' | 'reason_required'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  const reason = input.reason.trim()
  return await transactionResult<void, 'forbidden' | 'reason_required'>(db, async (tx) => {
    const suggested = await suggestDesProximity(tx, input.applicationId, now, signal)
    if (needsReason(input.determination, suggested) && reason.length < MIN_REASON_LENGTH) {
      return err('reason_required')
    }
    const values = {
      applicationId: input.applicationId,
      suggested,
      determination: input.determination,
      reason,
      determinedBy: actor.userId,
      determinedOn: await townToday(tx, now, signal),
    }
    await tx
      .insert(desProximityDeterminations)
      .values(values)
      .onConflictDoUpdate({ target: desProximityDeterminations.applicationId, set: values })
    await flagIssuedListStale(tx, input.applicationId, signal)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.des_determination.record',
        entityType: 'application',
        entityId: input.applicationId,
        after: { determination: input.determination, reason },
      },
      signal,
    )
    return ok(undefined)
  })
}
