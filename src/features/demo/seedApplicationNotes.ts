import { asc, eq } from 'drizzle-orm'
import { applicationNotes, applications, users } from '@/db/schema'
import { addApplicationNote } from '@/features/applications/notes'
import type { CoverageContext } from '@/features/demo/seedCoverage'
import { must } from '@/features/demo/seedPermitSupport'
import { PENDING_INVITE_EMAIL } from '@/features/demo/seedUserStates'

const HANDOFF_NOTES = [
  'Owner called the counter asking when this will be looked at. Told them Pat Planner has it now and will be in touch this week.',
  'Pat, the owner asked that calls go to the cell number on the form, not the house phone.',
]

async function plannersFirstApplication(ctx: CoverageContext): Promise<string | null> {
  const [row] = await ctx.db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.responsibleUserId))
    .where(eq(users.email, PENDING_INVITE_EMAIL))
    .orderBy(asc(applications.number))
    .limit(1)
  return row?.id ?? null
}

export async function seedApplicationNotes(ctx: CoverageContext): Promise<boolean> {
  const [already] = await ctx.db.select({ id: applicationNotes.id }).from(applicationNotes).limit(1)
  const applicationId = await plannersFirstApplication(ctx)
  if (already !== undefined || applicationId === null) return false
  for (const body of HANDOFF_NOTES) {
    must(
      await addApplicationNote(ctx.db, ctx.cast.staff, { applicationId, body }, ctx.signal),
      'application note',
    )
  }
  return true
}
