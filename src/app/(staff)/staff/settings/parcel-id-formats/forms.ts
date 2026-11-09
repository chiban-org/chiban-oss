import { z } from 'zod'
import { choice, inputField, optionalWholeNumber, requiredText } from '@/features/input/schemas'
import { err, ok } from '@/types/result'

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/
export const WIDTH_BOUNDS = { min: 1, max: 40 } as const

const keyField = inputField((raw) => {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return KEY_PATTERN.test(value)
    ? ok(value)
    : err('Use 2 to 32 lowercase letters, digits or underscores, starting with a letter.')
})

const SHAPE_FIELDS = {
  label: requiredText('a name for this ID', { max: 60 }),
  kind: choice('digits only or any text', ['digits', 'free_text'] as const),
  width: optionalWholeNumber('the number of digits', WIDTH_BOUNDS),
}

export const ADD_FORMAT_FORM = z.object({ key: keyField, ...SHAPE_FIELDS })

export const EDIT_FORMAT_FORM = z.object({ key: z.string().min(1), ...SHAPE_FIELDS })

export const FORMAT_KEY_FORM = z.object({ key: z.string().min(1) })
