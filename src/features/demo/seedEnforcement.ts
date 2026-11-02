import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { enforcementCases, townSettings } from '@/db/schema'
import { seedNamedComplaintCase } from '@/features/demo/seedEnforcementNamed'
import {
  seedCourtCase,
  seedNotFoundCase,
  seedServedCase,
  seedStayedCase,
} from '@/features/demo/seedEnforcementOrders'
import { seedPublicCase } from '@/features/demo/seedEnforcementPublic'
import { seedRegistrations } from '@/features/demo/seedEnforcementRegistrations'
import { dayFrom, type EnforcementSeedContext } from '@/features/demo/seedEnforcementSupport'
import { actorFor, must } from '@/features/demo/seedPermitSupport'
import { designateEnforcementOfficer } from '@/features/enforcement/designations'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'

export async function seedEnforcement(
  db: Db,
  store: ObjectStore,
  signal: AbortSignal,
  now: Date,
): Promise<boolean> {
  signal.throwIfAborted()
  const existing = await db.select({ id: enforcementCases.id }).from(enforcementCases).limit(1)
  if (existing.length > 0) return false
  const today = await townToday(db, now, signal)
  const ctx: EnforcementSeedContext = {
    db,
    store,
    signal,
    now,
    today,
    day: dayFrom(today),
    staff: await actorFor(db, 'staff', signal),
    admin: await actorFor(db, 'admin', signal),
    finance: await actorFor(db, 'finance', signal),
  }
  must(
    await designateEnforcementOfficer(
      db,
      ctx.admin,
      {
        userId: ctx.staff.userId,
        title: 'Code Enforcement Officer',
        adoptingAuthority: 'Select Board',
        adoptedOn: ctx.day(-400),
      },
      signal,
    ),
    'designate the enforcement officer',
  )
  await seedRegistrations(ctx)
  await seedNamedComplaintCase(ctx)
  await seedServedCase(ctx)
  await seedNotFoundCase(ctx)
  await seedStayedCase(ctx)
  await seedCourtCase(ctx)
  await seedPublicCase(ctx)
  await db.update(townSettings).set({ anonymousIntakeEnabled: false }).where(eq(townSettings.id, 1))
  return true
}
