import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import type { Capability } from '@/constants/capabilities'
import { ErrorIds } from '@/constants/errorIds'
import { hasCapability } from '@/features/authz/capabilities'
import type { AppContext } from './context'

const t = initTRPC.context<AppContext>().create({ transformer: superjson })

export const router = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure

export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.actor === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: ErrorIds.AUTH_SESSION_INVALID })
  }
  return next({ ctx: { ...ctx, actor: ctx.actor } })
})

export const staffProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.actor.kind !== 'staff') {
    throw new TRPCError({ code: 'FORBIDDEN', message: ErrorIds.AUTHZ_FORBIDDEN })
  }
  return next()
})

export function capabilityProcedure(capability: Capability) {
  return authedProcedure.use(async ({ ctx, next }) => {
    const allowed = await hasCapability(ctx.db, ctx.actor.userId, capability, ctx.signal)
    if (!allowed) {
      throw new TRPCError({ code: 'FORBIDDEN', message: ErrorIds.AUTHZ_FORBIDDEN })
    }
    return await next()
  })
}
