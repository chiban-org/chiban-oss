import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { parcelAliases } from '@/db/schema'
import { normalizeId } from '@/features/parcels/idFormats'
import { err, ok, type Result } from '@/types/result'

export interface ParcelIdRef {
  format?: string
  value: string
}

export type Resolved = { parcelId: string; via: 'active' | 'retired' }
export type ResolveError = 'not_found' | { ambiguous: string[] }

async function candidates(
  db: DbOrTx,
  ref: ParcelIdRef,
  status: 'active' | 'retired',
): Promise<string[]> {
  const normalized = normalizeId(ref.value)
  const where = [eq(parcelAliases.valueNormalized, normalized), eq(parcelAliases.status, status)]
  if (ref.format !== undefined) where.push(eq(parcelAliases.format, ref.format))
  const rows = await db
    .selectDistinct({ parcelId: parcelAliases.parcelId })
    .from(parcelAliases)
    .where(and(...where))
  return rows.map((r) => r.parcelId)
}

export async function resolveParcelId(
  db: DbOrTx,
  ref: ParcelIdRef,
  signal: AbortSignal,
): Promise<Result<Resolved, ResolveError>> {
  signal.throwIfAborted()
  if (normalizeId(ref.value) === '') return err('not_found')
  for (const via of ['active', 'retired'] as const) {
    const ids = await candidates(db, ref, via)
    const first = ids[0]
    if (ids.length === 1 && first !== undefined) return ok({ parcelId: first, via })
    if (ids.length > 1) return err({ ambiguous: ids })
  }
  return err('not_found')
}
