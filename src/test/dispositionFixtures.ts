import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { openCase } from '@/features/enforcement/cases'
import { recordRetentionEvent } from '@/features/records/recordEvents'
import type { ObjectStore } from '@/features/storage/objectStore'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
export const DISPOSITION_NOW = new Date('2027-03-02T15:00:00Z')

export interface EligibleCase {
  caseId: string
  documentIds: string[]
  versionIds: string[]
}

export async function eligibleCase(
  db: Db,
  store: ObjectStore,
  staff: Actor,
  documents: number,
  marker = 'complaint',
  eventOn = '2027-01-15',
): Promise<EligibleCase> {
  const opened = await openCase(
    db,
    staff,
    { locationText: `${marker} lane` },
    signal,
    DISPOSITION_NOW,
  )
  if (!opened.ok) throw new Error('case')
  const documentIds: string[] = []
  const versionIds: string[] = []
  for (let i = 0; i < documents; i += 1) {
    const up = await uploadAs(
      db,
      store,
      staff,
      { kind: 'enforcement_case', id: opened.value.caseId },
      pdfBytes(`${marker} ${i}`),
      { docKind: 'enforcement_photo', title: `${marker} photo ${i}` },
    )
    documentIds.push(up.documentId)
    versionIds.push(up.versionId)
  }
  const recorded = await recordRetentionEvent(
    db,
    staff,
    {
      target: { caseId: opened.value.caseId },
      kind: 'appeal_period_expired',
      occurredOn: eventOn as CivilDate,
    },
    signal,
    DISPOSITION_NOW,
  )
  if (!recorded.ok) throw new Error('event')
  return { caseId: opened.value.caseId, documentIds, versionIds }
}
