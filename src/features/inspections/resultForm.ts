import { z } from 'zod'
import { choice, optionalText, recordId, wholeNumber } from '@/features/input/schemas'
import type { RecordResultInput } from '@/features/inspections/recordResult'

const ITEM_PREFIX = 'item:'
const NOTE_PREFIX = 'note:'
const MAX_ROW_VERSION = 2_147_483_647

export const RESULT_FORM = z.object({
  inspectionId: recordId('an inspection'),
  expectedRowVersion: wholeNumber('the version of the inspection', {
    min: 1,
    max: MAX_ROW_VERSION,
  }),
  result: choice('a result', ['passed', 'failed'] as const),
  notes: optionalText('the notes', { max: 4000 }),
})

const ItemsSchema = z.array(
  z.object({
    itemKey: z.string().min(1).max(200),
    outcome: z.enum(['pass', 'fail', 'na']),
    note: z.string().max(2000).optional(),
  }),
)

function textOf(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return typeof value === 'string' ? value : undefined
}

export function itemsOf(formData: FormData): RecordResultInput['items'] | null {
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
  const parsed = ItemsSchema.safeParse(items)
  return parsed.success ? parsed.data : null
}
