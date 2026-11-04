import { isValidConfigKey } from '@/features/config/kinds'
import { slugKey } from '@/features/forms/fieldKeys'

export type NewItemKey =
  | { ok: true; key: string }
  | { ok: false; field: 'label' | 'key'; message: string }

export function newItemKey(
  label: string,
  typedKey: string,
  taken: ReadonlySet<string>,
): NewItemKey {
  const name = label.trim()
  const typed = typedKey.trim()
  if (typed !== '') {
    if (!isValidConfigKey(typed)) {
      return {
        ok: false,
        field: 'key',
        message: 'Use only letters, numbers, hyphens and dots, starting with a letter or number.',
      }
    }
    if (taken.has(typed)) {
      return { ok: false, field: 'key', message: 'Another item already uses this short name.' }
    }
    return { ok: true, key: typed }
  }
  if (name === '') return { ok: false, field: 'label', message: 'Enter a name.' }
  const base = slugKey(name).replaceAll('_', '-')
  let key = base
  for (let n = 2; taken.has(key); n += 1) key = `${base}-${String(n)}`
  return { ok: true, key }
}

export function prefixFromLabel(label: string): string {
  const initials = label
    .split(/[^A-Za-z]+/)
    .filter((w) => w.length > 2 || /^[A-Z]/.test(w))
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
    .slice(0, 4)
  return initials === '' ? 'XX' : initials
}
