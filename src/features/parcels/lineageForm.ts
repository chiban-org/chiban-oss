import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { parcelIdFormats } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
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
  | { code: 'parent_not_found' | 'ambiguous_id'; id: string }

export async function submitLineage(
  db: Db,
  actor: Actor,
  raw: LineageFormInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ eventId: string }, LineageFormError>> {
  const parsed = schema.safeParse(raw)
  const date = parsed.success ? parseCivilDate(parsed.data.effectiveDate) : null
  if (!parsed.success) return err({ code: 'invalid_input' })
  if (date === null || !date.ok) return err({ code: 'invalid_date' })
  const [display] = await db
    .select()
    .from(parcelIdFormats)
    .where(eq(parcelIdFormats.isDisplay, true))
  if (display === undefined) return err({ code: 'unknown_format' })
  const parents: string[] = []
  for (const id of splitIds(parsed.data.parents)) {
    const found = await resolveParcelId(db, { value: id }, signal)
    if (!found.ok) {
      return err(
        found.error === 'not_found'
          ? { code: 'parent_not_found', id }
          : { code: 'ambiguous_id', id },
      )
    }
    parents.push(found.value.parcelId)
  }
  const children: string[] = []
  for (const id of splitIds(parsed.data.children)) {
    const found = await resolveParcelId(db, { value: id }, signal)
    if (found.ok) {
      children.push(found.value.parcelId)
      continue
    }
    if (found.error !== 'not_found') return err({ code: 'ambiguous_id', id })
    const created = await createParcelPlaceholder(
      db,
      actor,
      { aliases: [{ format: display.key, value: id }] },
      signal,
    )
    if (!created.ok) return err({ code: created.error })
    children.push(created.value.parcelId)
  }
  const reference = parsed.data.reference?.trim()
  const event = await recordLineageEvent(
    db,
    actor,
    {
      kind: parsed.data.kind,
      effectiveDate: date.value as CivilDate,
      effectiveBasis: parsed.data.effectiveBasis,
      ...(reference === undefined || reference === '' ? {} : { reference }),
      parents,
      children,
    },
    signal,
    now,
  )
  return event.ok ? ok(event.value) : err({ code: event.error })
}
