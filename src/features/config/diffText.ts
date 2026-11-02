import { formatCents } from '@/lib/money'
import { words } from '@/lib/words'

const INDEX = /^\d+$/
const CENTS_SEGMENT = /^cents/i

function lastSegment(path: string): string {
  return (
    path
      .split('/')
      .filter((p) => p !== '')
      .at(-1) ?? ''
  )
}

function segmentText(part: string, isLast: boolean): string {
  if (INDEX.test(part)) return `item ${Number(part) + 1}`
  const text = words(part).toLowerCase()
  return isLast && CENTS_SEGMENT.test(part) ? text.replace(/^cents/, 'amount') : text
}

export function describePath(path: string): string {
  const parts = path.split('/').filter((p) => p !== '')
  const joined = parts.map((part, i) => segmentText(part, i === parts.length - 1)).join(', ')
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

export function describeValue(path: string, value: unknown): string {
  if (value === undefined) return 'nothing'
  if (typeof value === 'number' && CENTS_SEGMENT.test(lastSegment(path))) return formatCents(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
