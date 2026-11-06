import { type ActivityEntry, recentApplicationActivity } from '@/features/applications/activity'
import { type ApplicationNote, listApplicationNotes } from '@/features/applications/notes'
import { hasCapability } from '@/features/authz/capabilities'
import type { StaffContext } from '@/server/requireStaff'

export interface NotesData {
  notes: ApplicationNote[]
  canAdd: boolean
  activity: ActivityEntry[]
}

export async function loadNotesData(ctx: StaffContext, applicationId: string): Promise<NotesData> {
  const [notes, canAdd, activity] = await Promise.all([
    listApplicationNotes(ctx.db, ctx.actor, applicationId, ctx.signal),
    hasCapability(ctx.db, ctx.actor.userId, 'application.manage', ctx.signal),
    recentApplicationActivity(ctx.db, ctx.actor, applicationId, ctx.signal),
  ])
  return { notes, canAdd, activity }
}
