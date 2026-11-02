import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { parcelIdFormats } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import type { Actor } from '@/features/auth/actor'
import { checkIdFormat } from '@/features/parcels/idFormats'
import { createParcelPlaceholder, recordLineageEvent } from '@/features/parcels/lineage'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { type CivilDate, parseCivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const schema = z.object({
  kind: z.enum(['subdivision', 'lot_line_adjustment', 'merge']),
  effectiveDate: z.string(),
  effectiveBasis: z.enum(['recording', 'approval']),
  reference: z.string().optional(),
  parents: z.string(),
  children: z.string(),
})

export type LineageFormInput = z.input<typeof schema>

function splitIds(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

export type LineageFormError =
  | { code: string }
  | { code: 'parent_not_found' | 'ambiguous_id' | 'id_format_mismatch'; id: string }

async function resolveParents(
  db: Db,
  raw: string,
  signal: AbortSignal,
): Promise<Result<string[], LineageFormError>> {
  const out: string[] = []
  for (const id of splitIds(raw)) {
    const found = await resolveParcelId(db, { value: id }, signal)
    if (found.ok) out.push(found.value.parcelId)
    else if (found.error === 'not_found') return err({ code: 'parent_not_found', id })
    else return err({ code: 'ambiguous_id', id })
  }
  return ok(out)
}

interface ChildPlan {
  existing: string[]
  toCreate: string[]
}

async function planChildren(
  db: Db,
  raw: string,
  display: typeof parcelIdFormats.$inferSelect,
  signal: AbortSignal,
): Promise<Result<ChildPlan, LineageFormError>> {
  const plan: ChildPlan = { existing: [], toCreate: [] }
  for (const id of splitIds(raw)) {
    const found = await resolveParcelId(db, { value: id }, signal)
    if (found.ok) {
      plan.existing.push(found.value.parcelId)
      continue
    }
    if (found.error !== 'not_found') return err({ code: 'ambiguous_id', id })
    const format = { key: display.key, kind: display.kind, width: display.width }
    if (!checkIdFormat(format, id).ok) return err({ code: 'id_format_mismatch', id })
    plan.toCreate.push(id)
  }
  return ok(plan)
}

export async function submitLineage(
  db: Db,
  actor: Actor,
  raw: LineageFormInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ eventId: string }, LineageFormError>> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return err({ code: 'invalid_input' })
  const date = parseCivilDate(parsed.data.effectiveDate)
  if (!date.ok) return err({ code: 'invalid_date' })
  const [display] = await db
    .select()
    .from(parcelIdFormats)
    .where(eq(parcelIdFormats.isDisplay, true))
  if (display === undefined) return err({ code: 'unknown_format' })
  const parents = await resolveParents(db, parsed.data.parents, signal)
  if (!parents.ok) return parents
  const plan = await planChildren(db, parsed.data.children, display, signal)
  if (!plan.ok) return plan
  const reference = parsed.data.reference?.trim()
  return await transactionResult(db, async (tx) => {
    const children = [...plan.value.existing]
    for (const id of plan.value.toCreate) {
      const created = await createParcelPlaceholder(
        tx,
        actor,
        { aliases: [{ format: display.key, value: id }] },
        signal,
      )
      if (!created.ok) return err<LineageFormError>({ code: created.error })
      children.push(created.value.parcelId)
    }
    const event = await recordLineageEvent(
      tx,
      actor,
      {
        kind: parsed.data.kind,
        effectiveDate: date.value,
        effectiveBasis: parsed.data.effectiveBasis,
        ...(reference === undefined || reference === '' ? {} : { reference }),
        parents: parents.value,
        children,
      },
      signal,
      now,
    )
    return event.ok ? ok(event.value) : err<LineageFormError>({ code: event.error })
  })
}
