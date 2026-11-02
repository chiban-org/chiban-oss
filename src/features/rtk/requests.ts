import { civilDateSchema } from '@packs/nh/schema'
import { and, asc, eq, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import {
  RTK_RECEIVED_VIA,
  RTK_STATUSES,
  type RtkStatus,
  rtkRequests,
  rtkTimeStatements,
  rtkWithholdings,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { nextNumber } from '@/features/applications/createApplication'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { computeSubjectDue, type SubjectDue } from '@/features/clocks/subjectDue'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { rtkRequestVisibleTo } from '@/features/rtk/access'
import { rtkDueContext } from '@/features/rtk/dueContext'
import { firstResponseTimeliness, type RtkTimeliness } from '@/features/rtk/timeliness'
import { townToday } from '@/features/town/today'
import { type CivilDate, civilYear, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const LogSchema = z.object({
  receivedOn: civilDateSchema,
  receivedVia: z.enum(RTK_RECEIVED_VIA),
  requesterName: z.string().trim().max(200).optional(),
  requesterContact: z.string().trim().max(300).optional(),
  description: z.string().trim().min(1).max(5000),
})

export function responseRule() {
  const rule = ruleByKey(loadPack(), 'nh.rtk.response')
  if (rule.kind !== 'clock') throw new Error('nh.rtk.response is not a clock')
  return rule
}

export async function logRequest(
  db: Db,
  actor: Actor,
  input: z.input<typeof LogSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<
    { requestId: string; number: string; due: CivilDate },
    'forbidden' | 'invalid' | 'future_date'
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'rtk.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = LogSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const today = await townToday(tx, now, signal)
    if (daysBetween(today, value.receivedOn) > 0) return err('future_date')
    const due = computeSubjectDue(responseRule(), value.receivedOn, rtkDueContext())
    const number = await nextNumber(tx, 'RK', civilYear(value.receivedOn))
    const [row] = await tx
      .insert(rtkRequests)
      .values({
        number,
        receivedOn: value.receivedOn,
        receivedVia: value.receivedVia,
        requesterName: value.requesterName ?? null,
        requesterContact: value.requesterContact ?? null,
        description: value.description,
        responseDue: due,
        openDueOn: due.due,
        createdBy: actor.userId,
      })
      .returning({ id: rtkRequests.id })
    const requestId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'rtk.request_logged',
        entityType: 'rtk_request',
        entityId: requestId,
        after: { number, receivedOn: value.receivedOn, due: due.due },
      },
      signal,
    )
    return ok({ requestId, number, due: due.due })
  })
}

export interface RtkRequestView {
  id: string
  number: string
  receivedOn: CivilDate
  receivedVia: (typeof RTK_RECEIVED_VIA)[number]
  requesterName: string | null
  requesterContact: string | null
  description: string
  status: RtkStatus
  responseDue: SubjectDue
  statedDue: SubjectDue | null
  firstResponseOn: CivilDate | null
  firstResponseKind: string | null
  firstResponseUrl: string | null
  rowVersion: number
  timeliness: RtkTimeliness
  current: RtkTimeliness | null
  timeStatements: (typeof rtkTimeStatements.$inferSelect)[]
  withholdings: (typeof rtkWithholdings.$inferSelect)[]
}

export async function rtkRequestView(
  db: Db,
  actor: Actor,
  requestId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<Result<RtkRequestView, 'not_found'>> {
  signal.throwIfAborted()
  if (!z.string().uuid().safeParse(requestId).success) return err('not_found')
  const [row] = await db
    .select()
    .from(rtkRequests)
    .where(and(eq(rtkRequests.id, requestId), rtkRequestVisibleTo(actor)))
  if (row === undefined) return err('not_found')
  const timeStatements = await db
    .select()
    .from(rtkTimeStatements)
    .where(eq(rtkTimeStatements.requestId, requestId))
    .orderBy(asc(rtkTimeStatements.statedOn))
  const withholdings = await db
    .select()
    .from(rtkWithholdings)
    .where(eq(rtkWithholdings.requestId, requestId))
    .orderBy(asc(rtkWithholdings.createdAt))
  const firstResponseOn = row.firstResponseOn as CivilDate | null
  const timeliness = firstResponseTimeliness(row.responseDue.due, firstResponseOn, today)
  const current =
    row.openDueOn === null || row.status === 'closed' || row.status === 'withdrawn'
      ? null
      : firstResponseTimeliness(row.openDueOn as CivilDate, null, today)
  return ok({
    id: row.id,
    number: row.number,
    receivedOn: row.receivedOn as CivilDate,
    receivedVia: row.receivedVia,
    requesterName: row.requesterName,
    requesterContact: row.requesterContact,
    description: row.description,
    status: row.status,
    responseDue: row.responseDue,
    statedDue: row.statedDue,
    firstResponseOn,
    firstResponseKind: row.firstResponseKind,
    firstResponseUrl: row.firstResponseUrl,
    rowVersion: row.rowVersion,
    timeliness,
    current,
    timeStatements,
    withholdings,
  })
}

const ListSchema = z.object({
  filters: z.object({
    status: z.enum(RTK_STATUSES).optional(),
    overdueOnly: z.boolean().optional(),
  }),
  limit: z.number().int().min(1).max(100),
  cursor: z.string().max(200).optional(),
  today: civilDateSchema.optional(),
})

export interface RtkListRow {
  id: string
  number: string
  receivedOn: CivilDate
  description: string
  status: RtkStatus
  dueOn: CivilDate | null
  requesterName: string | null
}

const NO_DUE = '9999-12-31'

function decodeCursor(cursor: string | undefined): { due: string; id: string } | null {
  if (cursor === undefined) return null
  try {
    const parsed = z
      .object({ due: z.string(), id: z.string().uuid() })
      .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
    return parsed
  } catch {
    return null
  }
}

export async function listRtkRequests(
  db: Db,
  actor: Actor,
  input: z.input<typeof ListSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<{ rows: RtkListRow[]; nextCursor: string | null }> {
  signal.throwIfAborted()
  const parsed = ListSchema.safeParse(input)
  if (!parsed.success) return { rows: [], nextCursor: null }
  const { filters, limit, cursor } = parsed.data
  const today = parsed.data.today ?? (await townToday(db, now, signal))
  const dueKey = sql`coalesce(${rtkRequests.openDueOn}, ${NO_DUE}::date)`
  const conditions: SQL[] = [rtkRequestVisibleTo(actor)]
  if (filters.status !== undefined) conditions.push(eq(rtkRequests.status, filters.status))
  if (filters.overdueOnly === true) {
    conditions.push(sql`${rtkRequests.openDueOn} < ${today}::date`)
    conditions.push(sql`${rtkRequests.status} in ('open', 'awaiting_decision')`)
  }
  const after = decodeCursor(cursor)
  if (after !== null)
    conditions.push(sql`(${dueKey}, ${rtkRequests.id}) > (${after.due}::date, ${after.id}::uuid)`)
  const rows = await db
    .select({
      id: rtkRequests.id,
      number: rtkRequests.number,
      receivedOn: rtkRequests.receivedOn,
      description: rtkRequests.description,
      status: rtkRequests.status,
      dueOn: rtkRequests.openDueOn,
      requesterName: rtkRequests.requesterName,
      dueKey: sql<string>`${dueKey}::text`,
    })
    .from(rtkRequests)
    .where(and(...conditions))
    .orderBy(asc(dueKey), asc(rtkRequests.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  const nextCursor =
    rows.length > limit && last !== undefined
      ? Buffer.from(JSON.stringify({ due: last.dueKey, id: last.id })).toString('base64url')
      : null
  return {
    rows: page.map(({ dueKey: _k, ...r }) => ({
      ...r,
      receivedOn: r.receivedOn as CivilDate,
      dueOn: r.dueOn as CivilDate | null,
    })),
    nextCursor,
  }
}

export async function closeRequest(
  db: Db,
  actor: Actor,
  input: { requestId: string; to: 'closed' | 'withdrawn'; expectedRowVersion: number },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found' | 'stale_version' | 'already_closed'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'rtk.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(rtkRequests)
      .where(eq(rtkRequests.id, input.requestId))
      .for('update')
    if (row === undefined) return err('not_found')
    if (row.rowVersion !== input.expectedRowVersion) return err('stale_version')
    if (row.status === 'closed' || row.status === 'withdrawn') return err('already_closed')
    await tx
      .update(rtkRequests)
      .set({ status: input.to, openDueOn: null, rowVersion: row.rowVersion + 1 })
      .where(eq(rtkRequests.id, row.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: `rtk.request_${input.to}`,
        entityType: 'rtk_request',
        entityId: row.id,
        before: { status: row.status },
        after: { status: input.to },
      },
      signal,
    )
    return ok(undefined)
  })
}
