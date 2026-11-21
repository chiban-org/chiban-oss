import { and, desc, eq, gt, isNotNull, lte } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { appeals, clocks, holdPermitActions } from '@/db/schema'
import { appealSuspends } from '@/features/appeals/suspension'
import type { ApplicationContext } from '@/features/applications/context'
import { stateLabel } from '@/features/applications/stateLabel'
import type { Actor } from '@/features/auth/actor'
import { recordAdjustment } from '@/features/clocks/adjustClock'
import { effectiveBindings } from '@/features/config/bindings'
import { holdsEnabled } from '@/features/enforcement/holdReads'
import { loadPack, type Pack, ruleByKey } from '@/features/packs/loadPack'
import { addDays, type CivilDate, daysBetween } from '@/types/civilDate'

export async function exerciseByClocks(
  tx: Tx,
  applicationId: string,
  status: 'running' | 'stopped',
) {
  const rows = await tx
    .select()
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.status, status)))
    .orderBy(desc(clocks.createdAt))
  const pack = loadPack()
  return rows.filter((c) => {
    const rule = ruleByKey(pack, c.ruleKey, c.ruleVersion)
    return rule.kind === 'clock' && rule.clockType === 'exercise_by'
  })
}

export async function stopExerciseClocks(tx: Tx, applicationId: string): Promise<void> {
  for (const clock of await exerciseByClocks(tx, applicationId, 'running')) {
    await tx.update(clocks).set({ status: 'stopped' }).where(eq(clocks.id, clock.id))
  }
}

export function appealStops(app: Pick<ApplicationContext, 'typeBody'>, pack: Pack = loadPack()) {
  return appealSuspends(pack, new Set(effectiveBindings(app.typeBody, pack)))
}

interface Span {
  start: string
  end: string
}

async function endedSuspensions(tx: Tx, app: ApplicationContext): Promise<Span[]> {
  const [appealRows, holdRows] = await Promise.all([
    appealStops(app)
      ? tx
          .select({ start: appeals.filedOn, end: appeals.resolvedOn })
          .from(appeals)
          .where(and(eq(appeals.applicationId, app.id), isNotNull(appeals.resolvedOn)))
      : [],
    tx
      .select({ start: holdPermitActions.actedOn, end: holdPermitActions.reinstatedOn })
      .from(holdPermitActions)
      .where(
        and(
          eq(holdPermitActions.applicationId, app.id),
          eq(holdPermitActions.action, 'suspended'),
          isNotNull(holdPermitActions.reinstatedOn),
        ),
      ),
  ])
  return [...appealRows, ...holdRows].map((r) => ({ start: r.start, end: r.end ?? r.start }))
}

export async function lastReturnToIssued(
  tx: Tx,
  app: Pick<ApplicationContext, 'id' | 'issuedOn'>,
): Promise<string | null> {
  const [appealRows, holdRows] = await Promise.all([
    tx
      .select({ on: appeals.resolvedOn })
      .from(appeals)
      .where(and(eq(appeals.applicationId, app.id), isNotNull(appeals.resolvedOn))),
    tx
      .select({ start: holdPermitActions.actedOn, end: holdPermitActions.reinstatedOn })
      .from(holdPermitActions)
      .where(
        and(eq(holdPermitActions.applicationId, app.id), eq(holdPermitActions.action, 'suspended')),
      ),
  ])
  const heldAcross = (on: string) =>
    holdRows.some((h) => h.start < on && (h.end === null || h.end > on))
  const dates = [app.issuedOn, ...appealRows.map((r) => r.on), ...holdRows.map((r) => r.end)]
  return (
    dates
      .filter((x): x is string => x !== null && !heldAcross(x))
      .sort()
      .at(-1) ?? null
  )
}

export async function pastHoldCovered(
  tx: Tx,
  applicationId: string,
  on: CivilDate,
): Promise<boolean> {
  const [row] = await tx
    .select({ actedOn: holdPermitActions.actedOn })
    .from(holdPermitActions)
    .where(
      and(
        eq(holdPermitActions.applicationId, applicationId),
        eq(holdPermitActions.action, 'suspended'),
        lte(holdPermitActions.actedOn, on),
        gt(holdPermitActions.reinstatedOn, on),
      ),
    )
    .limit(1)
  return row !== undefined
}

export async function stoppedSince(
  tx: Tx,
  app: ApplicationContext,
  endingStart: CivilDate,
): Promise<CivilDate> {
  if (!holdsEnabled()) return endingStart
  const spans = await endedSuspensions(tx, app)
  let start: string = endingStart
  let moved = true
  while (moved) {
    moved = false
    for (const span of spans) {
      if (span.start < start && span.end > start) {
        start = span.start
        moved = true
      }
    }
  }
  return start as CivilDate
}

export async function tollStoppedClocks(
  tx: Tx,
  actor: Actor,
  span: { applicationId: string; from: CivilDate; to: CivilDate },
  signal: AbortSignal,
): Promise<void> {
  const label = stateLabel('suspended')
  const days = daysBetween(span.from, span.to)
  for (const clock of await exerciseByClocks(tx, span.applicationId, 'stopped')) {
    await tx.update(clocks).set({ status: 'running' }).where(eq(clocks.id, clock.id))
    await recordAdjustment(
      tx,
      actor,
      { ...clock, status: 'running' },
      {
        kind: 'tolling',
        days,
        newDue: addDays(clock.currentDue as CivilDate, days),
        reason: label,
      },
      signal,
    )
  }
}
