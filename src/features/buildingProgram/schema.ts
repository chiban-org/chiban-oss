import { z } from 'zod'

export const BuildingProgramBodySchema = z.object({
  key: z.literal('default'),
  permitsEnabled: z.boolean(),
  codeChoice: z.string().min(1).nullable(),
  residents: z.number().int().min(0).max(10_000_000).nullable(),
})

export type BuildingProgramBody = z.infer<typeof BuildingProgramBodySchema>
