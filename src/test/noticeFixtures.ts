import { randomUUID } from 'node:crypto'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { abutterLists, desProximityDeterminations, files } from '@/db/schema'
import type { Recipient } from '@/features/abutters/resolution'
import type { RecipientRole } from '@/features/abutters/roles'
import { attachDocument } from '@/features/documents/attach'
import type { BoardWorld } from '@/test/boardFixtures'

const signal = new AbortController().signal

export function recipient(index: number, roles: RecipientRole[] = ['abutter_owner']): Recipient {
  return {
    key: `r${index}`,
    roles,
    name: `Recipient ${index}`,
    mailingAddress: `${index} Heron Lane, Alder Pond NH 03999`,
    parcelIds: [],
    channelHint: 'mail',
    status: 'ok',
    provenance: [],
  } as unknown as Recipient
}

export async function issueListWithRecipients(
  db: Db,
  world: BoardWorld,
  applicationId: string,
  recipients: Recipient[],
  drawnOn = '2027-03-24',
): Promise<void> {
  await db.insert(abutterLists).values({
    applicationId,
    version: 1,
    status: 'issued',
    strategyKey: 'nh.abutters.adjacency_projection',
    strategyVersion: 1,
    resolverKey: 'nh.recipients.v1',
    resolverVersion: 1,
    drawnOn,
    layers: {},
    incomplete: { strategy: [], resolver: [] },
    issuedBy: world.staff.userId,
    issuedAt: new Date(`${drawnOn}T16:00:00Z`),
    snapshot: { recipients },
    snapshotSha256: 'fixture',
    createdBy: world.staff.userId,
  })
}

export async function recordDesProximity(
  db: Db,
  world: BoardWorld,
  applicationId: string,
  determination: 'within_500ft' | 'not_within' | 'not_applicable',
): Promise<void> {
  await db.insert(desProximityDeterminations).values({
    applicationId,
    suggested: {},
    determination,
    reason: 'fixture',
    determinedBy: world.staff.userId,
    determinedOn: '2027-03-01',
  })
}

export async function proofDocument(
  db: Db,
  world: BoardWorld,
  applicationId: string,
): Promise<string> {
  const sha256 = randomUUID().replaceAll('-', '').padEnd(64, '0')
  await db.insert(files).values({
    sha256,
    sizeBytes: 10,
    contentType: 'application/pdf',
    storageKey: `blobs/${sha256}`,
  })
  const attached = await db.transaction((tx) =>
    attachDocument(
      tx,
      world.staff,
      {
        target: { kind: 'application', id: applicationId },
        title: 'Certificate of mailing',
        docKind: 'notice_proof',
        file: { sha256, filename: 'certificate.pdf', contentType: 'application/pdf' },
        audiences: ['reviewers'],
      },
      signal,
    ),
  )
  if (attached.documentId === '') throw new AppError(ErrorIds.DB_INVARIANT, 'no document')
  return attached.documentId
}
