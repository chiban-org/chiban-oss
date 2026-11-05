import { applicationsRouter } from './routers/applications'
import { documentsRouter } from './routers/documents'
import { parcelsRouter } from './routers/parcels'
import { searchRouter } from './routers/search'
import { authedProcedure, createCallerFactory, router } from './trpc'

export const appRouter = router({
  applications: applicationsRouter,
  documents: documentsRouter,
  me: authedProcedure.query(({ ctx }) => ctx.actor),
  parcels: parcelsRouter,
  search: searchRouter,
})

export type AppRouter = typeof appRouter

export const createCaller = createCallerFactory(appRouter)
