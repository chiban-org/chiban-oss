import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Tx } from '@/db/client'
import type { RecipientRole } from '@/features/abutters/roles'
import type { Candidate, IncompleteReason } from '@/features/abutters/types'

export interface Provenance {
  source:
    | 'parcel_record'
    | 'association_roster'
    | 'park_roster'
    | 'restriction_roster'
    | 'application_professionals'
    | 'regional_contacts'
    | 'application_form'
    | 'staff_entry'
  ref: string
  asOf: string | null
  ageDays: number | null
  state: 'fresh' | 'stale' | 'reviewed' | 'entered'
  checkedOn?: string
  replaced?: { name: string; mailingAddress: string | null }
  reason?: string
}

export type ChannelHint = 'verified_mail' | 'certified_mail' | 'first_class_mail'

export interface Recipient {
  key: string
  roles: RecipientRole[]
  name: string
  mailingAddress: string | null
  parcelIds: string[]
  channelHint: ChannelHint
  status: 'ok' | 'incomplete_data' | 'needs_decision'
  provenance: Provenance[]
}

export interface ResolverInput {
  applicationId: string
  candidates: Candidate[]
  roles: RecipientRole[]
  conditionalRoles: { role: RecipientRole; when: 'regional_impact_yes' | 'des_within_500ft' }[]
  now: Date
}

export interface ResolverOutput {
  recipients: Recipient[]
  incomplete: IncompleteReason[]
}

export interface RecipientResolver {
  key: string
  version: number
  resolve(tx: Tx, input: ResolverInput, signal: AbortSignal): Promise<ResolverOutput>
}

const resolvers = new Map<string, RecipientResolver>()

export function registerRecipientResolver(resolver: RecipientResolver): void {
  resolvers.set(resolver.key, resolver)
}

export function recipientResolver(key: string): RecipientResolver {
  const found = resolvers.get(key)
  if (found === undefined) {
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'No such recipient resolver', { key })
  }
  return found
}
