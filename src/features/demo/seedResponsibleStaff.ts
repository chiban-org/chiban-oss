import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { applications, users } from '@/db/schema'
import { setResponsibleStaff } from '@/features/applications/responsibleStaff'
import type { CoverageContext } from '@/features/demo/seedCoverage'
import { must } from '@/features/demo/seedPermitSupport'
import { PENDING_INVITE_EMAIL } from '@/features/demo/seedUserStates'
import { NEEDS_ACTION_STATES } from '@/features/queue/stateScopes'

const CLERK_SHARE = 3
const PLANNER_SHARE = 2

async function plannerId(ctx: CoverageContext): Promise<string | null> {
  const [row] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PENDING_INVITE_EMAIL))
  return row?.id ?? null
}

export async function seedResponsibleStaff(ctx: CoverageContext): Promise<boolean> {
  const [already] = await ctx.db
    .select({ id: applications.id })
    .from(applications)
    .where(isNotNull(applications.responsibleUserId))
    .limit(1)
  const planner = await plannerId(ctx)
  if (already !== undefined || planner === null) return false
  const open = await ctx.db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        inArray(applications.state, [...NEEDS_ACTION_STATES]),
        isNull(applications.responsibleUserId),
      ),
    )
    .orderBy(asc(applications.number))
    .limit(CLERK_SHARE + PLANNER_SHARE)
  for (const [index, app] of open.entries()) {
    const userId = index < CLERK_SHARE ? ctx.cast.staff.userId : planner
    must(
      await setResponsibleStaff(
        ctx.db,
        ctx.cast.staff,
        { applicationId: app.id, userId },
        ctx.signal,
      ),
      'responsible staff',
    )
  }
  return open.length > 0
}
