import { z } from 'zod'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import { authedProcedure, router } from '../trpc'

const listInput = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().max(40).optional(),
})

export const applicationsRouter = router({
  list: authedProcedure
    .input(listInput)
    .query(({ ctx, input }) => listApplicationsForViewer(ctx.db, ctx.actor, input, ctx.signal)),
})
