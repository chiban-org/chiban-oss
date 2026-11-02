import type { Tx } from '@/db/client'
import { mergeRecipients } from '@/features/abutters/dedupe'
import {
  type RecipientResolver,
  type ResolverInput,
  type ResolverOutput,
  registerRecipientResolver,
} from '@/features/abutters/resolution'
import { buildContext } from './resolverContext'
import { resolveParcels } from './resolverParcels'
import {
  resolveApplicant,
  resolveConditional,
  resolveProfessionals,
  resolveRestrictions,
} from './resolverRoles'

export const NH_RESOLVER_KEY = 'nh.recipients.v1'
export const NH_RESOLVER_VERSION = 1

async function resolve(tx: Tx, input: ResolverInput, signal: AbortSignal): Promise<ResolverOutput> {
  signal.throwIfAborted()
  const ctx = await buildContext(tx, input, signal)
  await resolveParcels(ctx)
  await resolveRestrictions(ctx, signal)
  await resolveProfessionals(ctx, signal)
  await resolveConditional(ctx, signal)
  await resolveApplicant(ctx, signal)
  return { recipients: mergeRecipients(ctx.recipients), incomplete: ctx.incomplete }
}

export const nhRecipientResolver: RecipientResolver = {
  key: NH_RESOLVER_KEY,
  version: NH_RESOLVER_VERSION,
  resolve,
}

registerRecipientResolver(nhRecipientResolver)
