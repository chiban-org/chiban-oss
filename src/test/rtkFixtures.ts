import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { approveRendition } from '@/features/renditions/approvals'
import { logRequest } from '@/features/rtk/requests'
import type { ObjectStore } from '@/features/storage/objectStore'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'
import type { CivilDate } from '@/types/civilDate'

export const RTK_TODAY = new Date('2026-11-06T16:00:00Z')
export const RTK_RECEIVED_ON = '2026-10-30' as CivilDate
const signal = new AbortController().signal

export async function loggedRequest(db: Db, actor: Actor): Promise<string> {
  const logged = await logRequest(
    db,
    actor,
    {
      receivedOn: RTK_RECEIVED_ON,
      receivedVia: 'email',
      requesterName: 'Jordan Reyes',
      requesterContact: 'jordan@example.test',
      description: 'The Birch Lane owner letters',
    },
    signal,
    RTK_TODAY,
  )
  if (!logged.ok) throw new AppError(ErrorIds.DB_INVARIANT, `log failed: ${logged.error}`)
  return logged.value.requestId
}

export interface ReleasableRecord {
  documentId: string
  versionId: string
  approvalId: string
}

export async function releasableRecord(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  requestId: string,
): Promise<ReleasableRecord> {
  const doc = await uploadRedactionFixture(db, store, actor, 'letter.pdf', undefined, false)
  const versionId = await redactedVersionOf(db, store, actor, doc, 'rtk_release', requestId)
  const approved = await approveRendition(
    db,
    actor,
    { versionId, purpose: 'rtk_release', rtkRequestId: requestId, reviewStatement: STATEMENT },
    signal,
    store,
  )
  if (!approved.ok) throw new AppError(ErrorIds.DB_INVARIANT, `approve failed: ${approved.error}`)
  return { documentId: doc.documentId, versionId, approvalId: approved.value.approvalId }
}
