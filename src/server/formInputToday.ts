import type { z } from 'zod'
import { townToday } from '@/features/town/today'
import { isCheckOnly } from '@/server/actionGuard'
import { type ActionContext, type ActionResult, runStaffAction } from '@/server/actionRunner'
import { CHECK_PASSED, parseForm } from '@/server/formInput'
import type { CivilDate } from '@/types/civilDate'

export async function runStaffFormToday<S extends z.ZodType>(
  formData: FormData,
  build: (today: CivilDate) => S,
  fn: (ctx: ActionContext, input: z.output<S>) => Promise<ActionResult>,
): Promise<ActionResult> {
  return await runStaffAction(
    formData,
    async (ctx) => {
      const today = await townToday(ctx.db, new Date(), ctx.signal)
      const parsed = parseForm(build(today), formData)
      if (!parsed.ok) return parsed.error
      if (isCheckOnly(formData)) return CHECK_PASSED
      return await fn(ctx, parsed.value)
    },
    { answersCheck: true },
  )
}
