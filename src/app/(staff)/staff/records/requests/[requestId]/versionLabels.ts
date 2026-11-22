import { formatInstantDate, formatInstantLong } from '@/lib/formatDate'

const ROLE_LABELS = new Map<string, string>([
  ['original', 'Original'],
  ['public_redacted', 'Redacted copy for the public'],
  ['release_redacted', 'Redacted copy for this request'],
])

export function roleLabel(role: string): string {
  return ROLE_LABELS.get(role) ?? 'Copy'
}

export interface VersionOrigin {
  madeFor?: { requestId: string; number: string } | null | undefined
  currentRequestId: string
}

export function originRoleLabel(role: string, origin: VersionOrigin | undefined): string {
  const madeFor = origin?.madeFor ?? null
  if (role !== 'release_redacted' || madeFor === null) return roleLabel(role)
  if (madeFor.requestId === origin?.currentRequestId) return roleLabel(role)
  return `Redacted copy made for ${madeFor.number}`
}

export function versionLabel(
  role: string,
  createdAt: Date,
  timeZone: string,
  origin?: VersionOrigin,
): string {
  const when =
    role === 'original'
      ? formatInstantDate(createdAt, timeZone)
      : formatInstantLong(createdAt, timeZone)
  return `${originRoleLabel(role, origin)}, ${when}`
}
