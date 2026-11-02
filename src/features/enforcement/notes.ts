import { civilDateSchema } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { enforcementCases, enforcementNotes } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

const NoteSchema = z.object({
  caseId: z.string().uuid(),
  observedOn: civilDateSchema,
  body: z.string().trim().min(1).max(5000),
})

export async function addNote(
  db: Db,
  actor: Actor,
  input: z.input<typeof NoteSchema>,
  signal: AbortSignal,
): Promise<Result<{ noteId: string }, 'forbidden' | 'invalid' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = NoteSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const [found] = await tx
      .select({ id: enforcementCases.id })
      .from(enforcementCases)
      .where(eq(enforcementCases.id, value.caseId))
    if (found === undefined) return err('not_found')
    const [row] = await tx
      .insert(enforcementNotes)
      .values({
        caseId: value.caseId,
        observedOn: value.observedOn,
        body: value.body,
        authorId: actor.userId,
      })
      .returning({ id: enforcementNotes.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.note_added',
        entityType: 'enforcement_case',
        entityId: value.caseId,
        after: { noteId: row?.id, observedOn: value.observedOn },
      },
      signal,
    )
    return ok({ noteId: row?.id ?? '' })
  })
}
