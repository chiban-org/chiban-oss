import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { enforcementCases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'

export const REPEAT_SUBMIT_WINDOW_SECONDS = 10

interface OpeningRequest {
  locationText: string
  parcelId?: string | undefined
}

export async function lockCaseOpening(
  tx: Tx,
  actor: Actor,
  request: OpeningRequest,
): Promise<void> {
  const key = `enforcement.open:${actor.userId}:${request.locationText.trim()}`
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
}

export async function caseJustOpenedBy(
  tx: Tx,
  actor: Actor,
  request: OpeningRequest,
  windowSeconds: number,
): Promise<{ caseId: string; number: string } | null> {
  const [row] = await tx
    .select({ caseId: enforcementCases.id, number: enforcementCases.number })
    .from(enforcementCases)
    .where(
      and(
        eq(enforcementCases.assignedTo, actor.userId),
        eq(enforcementCases.status, 'intake'),
        eq(enforcementCases.locationText, request.locationText.trim()),
        request.parcelId === undefined
          ? isNull(enforcementCases.parcelId)
          : eq(enforcementCases.parcelId, request.parcelId),
        gt(enforcementCases.createdAt, sql`now() - make_interval(secs => ${windowSeconds})`),
      ),
    )
    .orderBy(desc(enforcementCases.createdAt))
    .limit(1)
  return row ?? null
}
