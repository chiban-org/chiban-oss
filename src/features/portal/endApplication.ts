import type { Db } from '@/db/client'
import { isProjectParty } from '@/features/access/queries'
import { loadApplicationContext } from '@/features/applications/context'
import type { CoreState } from '@/features/applications/states'
import { type TransitionError, transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { err, ok, type Result } from '@/types/result'

export type Ending = 'withdraw' | 'delete_draft'

export const ENDING_ROLES = ['applicant', 'owner', 'agent', 'contractor'] as const

export const ENDABLE_FROM: Record<Ending, readonly CoreState[]> = {
  withdraw: ['submitted', 'under_review'],
  delete_draft: ['draft'],
}

export type EndError = 'not_found' | 'forbidden' | 'invalid_transition' | TransitionError

export async function endApplication(
  db: Db,
  actor: Actor,
  input: { applicationId: string; expectedRowVersion: number; ending: Ending },
  signal: AbortSignal,
): Promise<Result<void, EndError>> {
  const app = await loadApplicationContext(db, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (!(await isProjectParty(db, actor, app.projectId, [...ENDING_ROLES], signal))) {
    return err('forbidden')
  }
  if (!ENDABLE_FROM[input.ending].includes(app.state)) return err('invalid_transition')
  const moved = await db.transaction((tx) =>
    transitionApplication(
      tx,
      actor,
      {
        applicationId: input.applicationId,
        to: 'withdrawn',
        expectedRowVersion: input.expectedRowVersion,
      },
      signal,
    ),
  )
  return moved.ok ? ok(undefined) : err(moved.error)
}
