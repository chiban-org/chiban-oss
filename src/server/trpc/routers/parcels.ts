import { z } from 'zod'
import { pickParcels } from '@/features/parcels/parcelPick'
import { searchParcels } from '@/features/parcels/searchParcels'
import { publicProcedure, router, staffProcedure } from '../trpc'

const searchInput = z.object({
  q: z.string().max(100),
  limit: z.number().int().min(1).max(500).optional(),
})

export const parcelsRouter = router({
  search: publicProcedure
    .input(searchInput)
    .query(({ ctx, input }) => searchParcels(ctx.db, input, ctx.signal)),
  pick: staffProcedure
    .input(z.object({ q: z.string().max(100) }))
    .query(({ ctx, input }) => pickParcels(ctx.db, input.q, ctx.signal)),
})
