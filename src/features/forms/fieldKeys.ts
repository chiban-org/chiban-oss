const MAX_KEY_LENGTH = 40
const FALLBACK_KEY = 'question'
const DIGIT_PREFIX = 'q_'

export function slugKey(text: string): string {
  const words = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (words === '') return FALLBACK_KEY
  const started = /^[a-z]/.test(words) ? words : `${DIGIT_PREFIX}${words}`
  return started.slice(0, MAX_KEY_LENGTH).replace(/_+$/, '')
}

export function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}_${n}`)) n += 1
  return `${base}_${n}`
}

export function keyForLabel(label: string, taken: ReadonlySet<string>): string {
  return uniqueKey(slugKey(label), taken)
}
