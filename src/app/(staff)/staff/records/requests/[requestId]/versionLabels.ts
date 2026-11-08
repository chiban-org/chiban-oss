import { formatInstantDate, formatInstantLong } from '@/lib/formatDate'

const ROLE_LABELS = new Map<string, string>([
  ['original', 'Original'],
  ['public_redacted', 'Redacted copy for the public'],
  ['release_redacted', 'Redacted copy for this request'],
])

export function roleLabel(role: string): string {
  return ROLE_LABELS.get(role) ?? 'Copy'
}

export function versionLabel(role: string, createdAt: Date, timeZone: string): string {
  const when =
    role === 'original'
      ? formatInstantDate(createdAt, timeZone)
      : formatInstantLong(createdAt, timeZone)
  return `${roleLabel(role)}, ${when}`
}
