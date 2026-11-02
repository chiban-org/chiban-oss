import { parcelsRouter } from './routers/parcels'
import { authedProcedure, createCallerFactory, router } from './trpc'

export const appRouter = router({
  me: authedProcedure.query(({ ctx }) => ctx.actor),
  parcels: parcelsRouter,
})

export type AppRouter = typeof appRouter

export const createCaller = createCallerFactory(appRouter)
