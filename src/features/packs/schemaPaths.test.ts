import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { leafPaths } from '@/features/packs/schemaPaths'

describe('leafPaths', () => {
  it('lists nested objects, union branches, object arrays, and primitive arrays', () => {
    const schema = z.object({
      a: z.string(),
      b: z.object({ c: z.number().optional(), d: z.array(z.string()) }),
      e: z.union([z.object({ f: z.string() }), z.object({ g: z.string() })]),
      h: z.array(z.object({ i: z.string() })),
      j: z.string().nullable(),
    })
    expect(leafPaths(schema)).toEqual(['a', 'b.c', 'b.d', 'e.f', 'e.g', 'h.i', 'j'])
  })

  it('looks through refinements and transforms', () => {
    const schema = z.object({
      d: z
        .string()
        .refine(() => true)
        .transform((s) => s),
    })
    expect(leafPaths(schema)).toEqual(['d'])
  })
})
