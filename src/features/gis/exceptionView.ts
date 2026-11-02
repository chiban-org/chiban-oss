import { z } from 'zod'
import { isUuid } from '@/utils/uuid'

export interface OwnerChangeRow {
  label: string
  stored: string
  incoming: string
  changed: boolean
}

const ownerValues = z.object({
  ownerName: z.string().nullable().optional(),
  mailingAddress: z.string().nullable().optional(),
})

const heldPayload = z.object({ current: ownerValues, proposed: ownerValues })
const parcelPayload = z.object({ parcelId: z.string() })

const FIELDS = [
  ['ownerName', 'Owner'],
  ['mailingAddress', 'Mailing address'],
] as const

const BLANK = 'Blank'

export function ownerChangeRows(payload: unknown): OwnerChangeRow[] {
  const parsed = heldPayload.safeParse(payload)
  if (!parsed.success) return []
  const { current, proposed } = parsed.data
  return FIELDS.map(([field, label]) => {
    const stored = current[field] ?? null
    const incoming = proposed[field] ?? null
    return {
      label,
      stored: stored ?? BLANK,
      incoming: incoming ?? BLANK,
      changed: stored !== incoming,
    }
  })
}

export function exceptionParcelId(payload: unknown): string | null {
  const parsed = parcelPayload.safeParse(payload)
  return parsed.success && isUuid(parsed.data.parcelId) ? parsed.data.parcelId : null
}
