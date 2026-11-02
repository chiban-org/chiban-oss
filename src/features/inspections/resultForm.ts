import { z } from 'zod'
import type { RecordResultInput } from '@/features/inspections/recordResult'

const ITEM_PREFIX = 'item:'
const NOTE_PREFIX = 'note:'

const ResultFormSchema = z.object({
  inspectionId: z.uuid(),
  expectedRowVersion: z.coerce.number().int().min(1),
  result: z.enum(['passed', 'failed']),
  notes: z.string().max(4000).optional(),
  items: z.array(
    z.object({
      itemKey: z.string().min(1).max(200),
      outcome: z.enum(['pass', 'fail', 'na']),
      note: z.string().max(2000).optional(),
    }),
  ),
})

function textOf(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return typeof value === 'string' ? value : undefined
}

export function parseResultForm(formData: FormData): RecordResultInput | null {
  const items = [...formData.keys()]
    .filter((key) => key.startsWith(ITEM_PREFIX))
    .map((key) => {
      const itemKey = key.slice(ITEM_PREFIX.length)
      const note = textOf(formData, `${NOTE_PREFIX}${itemKey}`)
      return {
        itemKey,
        outcome: textOf(formData, key),
        ...(note === undefined || note.trim() === '' ? {} : { note: note.trim() }),
      }
    })
  const parsed = ResultFormSchema.safeParse({
    inspectionId: textOf(formData, 'inspectionId'),
    expectedRowVersion: textOf(formData, 'expectedRowVersion'),
    result: textOf(formData, 'result'),
    notes: textOf(formData, 'notes'),
    items,
  })
  if (!parsed.success) return null
  const { notes, ...rest } = parsed.data
  return { ...rest, ...(notes === undefined || notes.trim() === '' ? {} : { notes: notes.trim() }) }
}
