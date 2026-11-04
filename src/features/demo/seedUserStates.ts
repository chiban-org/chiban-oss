import { eq } from 'drizzle-orm'
import { userRoles, users } from '@/db/schema'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import type { CoverageContext } from '@/features/demo/seedCoverage'
import { must } from '@/features/demo/seedPermitSupport'
import { inviteStaff } from '@/features/users/invite'
import { disableStaff } from '@/features/users/manage'

export const PENDING_INVITE_EMAIL = `planner@${DEMO_DOMAIN}`
export const DISABLED_STAFF_EMAIL = `former.inspector@${DEMO_DOMAIN}`

async function exists(ctx: CoverageContext, email: string): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  return row !== undefined
}

async function pendingInvite(ctx: CoverageContext): Promise<boolean> {
  if (await exists(ctx, PENDING_INVITE_EMAIL)) return false
  must(
    await inviteStaff(
      { db: ctx.db, actor: ctx.cast.admin, signal: ctx.signal, mail: ctx.mail, now: ctx.now },
      { displayName: 'Pat Planner', email: PENDING_INVITE_EMAIL, roles: ['staff'] },
    ),
    'pending staff invite',
  )
  return true
}

async function disabledAccount(ctx: CoverageContext): Promise<boolean> {
  if (await exists(ctx, DISABLED_STAFF_EMAIL)) return false
  const [row] = await ctx.db
    .insert(users)
    .values({ email: DISABLED_STAFF_EMAIL, displayName: 'Dale Hollis', kind: 'staff' })
    .returning({ id: users.id })
  const userId = row?.id ?? ''
  await ctx.db.insert(userRoles).values({ userId, role: 'inspector' })
  must(
    await disableStaff(
      { db: ctx.db, actor: ctx.cast.admin, signal: ctx.signal },
      userId,
      'Retired at the end of June. Open inspections moved to Ira Inspector.',
    ),
    'disabled staff account',
  )
  return true
}

export async function seedUserStates(ctx: CoverageContext): Promise<boolean> {
  const steps = [await pendingInvite(ctx), await disabledAccount(ctx)]
  return steps.some(Boolean)
}
