import type { Tx } from '@/db/client'
import { mergeRecipients } from '@/features/abutters/dedupe'
import {
  type ResolverContext,
  resolveMunicipalOffices,
  resolveWaterSupplier,
} from '@/features/abutters/municipalOffices'
import {
  type Recipient,
  type RecipientResolver,
  type ResolverInput,
  type ResolverOutput,
  registerRecipientResolver,
} from '@/features/abutters/resolution'
import type { RecipientRole } from '@/features/abutters/roles'
import { resolveTownParties } from '@/features/abutters/townParties'
import type { IncompleteReason } from '@/features/abutters/types'
import { resolveApplicant, resolveOwners } from './owners'

export const ME_RESOLVER_KEY = 'me.recipients.v1'
export const ME_RESOLVER_VERSION = 1

const OFFICE_ROLES: readonly RecipientRole[] = ['municipal_clerk', 'municipal_reviewing_authority']

function wantsWater(input: ResolverInput): boolean {
  return (
    input.roles.includes('water_supplier') ||
    input.conditionalRoles.some((c) => c.role === 'water_supplier')
  )
}

async function officeRecipients(ctx: ResolverContext, roles: RecipientRole[]) {
  const requested = OFFICE_ROLES.filter((role) => roles.includes(role))
  if (requested.length === 0) return []
  const found: IncompleteReason[] = []
  const offices = await resolveMunicipalOffices({ ...ctx, incomplete: found })
  ctx.incomplete.push(...found.filter((i) => i.role === undefined || requested.includes(i.role)))
  return offices.filter((r) => r.roles.some((role) => requested.includes(role)))
}

async function resolve(tx: Tx, input: ResolverInput, signal: AbortSignal): Promise<ResolverOutput> {
  signal.throwIfAborted()
  const incomplete: IncompleteReason[] = []
  const ctx: ResolverContext = { tx, input, signal, incomplete }
  const recipients: Recipient[] = [
    ...(input.roles.includes('applicant')
      ? await resolveApplicant(tx, input, incomplete, signal)
      : []),
    ...(input.roles.includes('abutter_owner')
      ? await resolveOwners(tx, input, incomplete, signal)
      : []),
    ...(await officeRecipients(ctx, input.roles)),
    ...(wantsWater(input) ? await resolveWaterSupplier(ctx) : []),
    ...(await resolveTownParties(ctx, input.roles)),
  ]
  return { recipients: mergeRecipients(recipients), incomplete }
}

export const meRecipientResolver: RecipientResolver = {
  key: ME_RESOLVER_KEY,
  version: ME_RESOLVER_VERSION,
  resolve,
}

registerRecipientResolver(meRecipientResolver)
