import { z } from 'zod'

export const ReviewRoutesBodySchema = z
  .object({
    key: z.literal('default'),
    departments: z.array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        reviewerUserIds: z.array(z.string().uuid()),
      }),
    ),
    routes: z.array(
      z.object({
        applicationTypeKey: z.string().min(1),
        departmentKeys: z.array(z.string().min(1)).min(1),
        commentDueDaysBeforeMeeting: z.number().int().min(0),
      }),
    ),
  })
  .superRefine((body, ctx) => {
    const known = new Set(body.departments.map((d) => d.key))
    for (const [index, route] of body.routes.entries()) {
      for (const key of route.departmentKeys) {
        if (!known.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['routes', index, 'departmentKeys'],
            message: `Route names a department that is not defined: ${key}`,
          })
        }
      }
    }
  })
export type ReviewRoutesBody = z.infer<typeof ReviewRoutesBodySchema>

export const EMPTY_REVIEW_ROUTES: ReviewRoutesBody = { key: 'default', departments: [], routes: [] }
