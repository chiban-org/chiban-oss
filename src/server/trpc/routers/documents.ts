import { z } from 'zod'
import { searchDocuments, searchPublicDocuments } from '@/features/documents/search'
import { authedProcedure, publicProcedure, router } from '../trpc'

const MAX_QUERY = 200

const queryInput = z.object({
  q: z.string().max(MAX_QUERY),
  limit: z.number().int().min(1).max(50).optional(),
})

export const documentsRouter = router({
  searchPublic: publicProcedure
    .input(queryInput)
    .query(({ ctx, input }) => searchPublicDocuments(ctx.db, input, ctx.signal)),
  search: authedProcedure
    .input(queryInput.extend({ cursor: z.string().max(40).optional() }))
    .query(({ ctx, input }) => searchDocuments(ctx.db, ctx.actor, input, ctx.signal)),
})
