import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbOrTx } from '@/db/client'
import { applicationNotes, applications, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { hasFullRecordAccess } from '@/features/access/roles'
import { NOTE_MAX_LENGTH } from '@/features/applications/noteLimits'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

const NoteSchema = z.object({
  applicationId: z.string().uuid(),
  body: z.string().trim().min(1).max(NOTE_MAX_LENGTH),
})

export type ApplicationNoteError = 'forbidden' | 'invalid' | 'not_found'

export interface ApplicationNote {
  id: string
  body: string
  authorName: string | null
  createdAt: Date
}

export async function addApplicationNote(
  db: Db,
  actor: Actor,
  input: z.input<typeof NoteSchema>,
  signal: AbortSignal,
): Promise<Result<{ noteId: string }, ApplicationNoteError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'application.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = NoteSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult<{ noteId: string }, ApplicationNoteError>(db, async (tx) => {
    const [found] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, value.applicationId))
    if (found === undefined) return err('not_found')
    const [row] = await tx
      .insert(applicationNotes)
      .values({ applicationId: value.applicationId, body: value.body, authorId: actor.userId })
      .returning({ id: applicationNotes.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'application.note_added',
        entityType: 'application',
        entityId: value.applicationId,
        after: { noteId: row?.id },
      },
      signal,
    )
    return ok({ noteId: row?.id ?? '' })
  })
}

export async function listApplicationNotes(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<ApplicationNote[]> {
  signal.throwIfAborted()
  if (!hasFullRecordAccess(actor)) return []
  return await db
    .select({
      id: applicationNotes.id,
      body: applicationNotes.body,
      authorName: users.displayName,
      createdAt: applicationNotes.createdAt,
    })
    .from(applicationNotes)
    .leftJoin(users, eq(users.id, applicationNotes.authorId))
    .where(eq(applicationNotes.applicationId, applicationId))
    .orderBy(desc(applicationNotes.createdAt), desc(applicationNotes.id))
}
