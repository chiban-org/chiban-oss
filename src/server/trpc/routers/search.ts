import { z } from 'zod'
import { findRecords } from '@/features/search/findRecords'
import { MAX_SEARCH_CHARS } from '@/features/search/searchTypes'
import { router, staffProcedure } from '../trpc'

export const searchRouter = router({
  find: staffProcedure
    .input(z.object({ q: z.string().max(MAX_SEARCH_CHARS) }))
    .query(({ ctx, input }) => findRecords(ctx.db, ctx.actor, input.q, ctx.signal)),
})
