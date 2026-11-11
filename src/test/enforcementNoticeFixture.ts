import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { sendViolationNotice } from '@/features/enforcement/notices'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { CivilDate } from '@/types/civilDate'

export async function sendFixtureNotice(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: { caseId: string; findingId: string; sentOn: string },
): Promise<void> {
  const sent = await sendViolationNotice(
    db,
    store,
    actor,
    {
      caseId: input.caseId,
      findingIds: [input.findingId],
      sentOn: input.sentOn,
      method: 'in_hand',
    },
    new AbortController().signal,
  )
  if (!sent.ok) throw new AppError(ErrorIds.DB_INVARIANT, `notice failed: ${sent.error}`)
}
