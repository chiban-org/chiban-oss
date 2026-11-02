import { count, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { computeDue } from '@/features/clocks/computeDue'
import { seedDispositionDemo } from '@/features/demo/seedDisposition'
import { actorFor, must } from '@/features/demo/seedPermitSupport'
import { seedLetterDocument, seedRedactedVersion } from '@/features/demo/seedRedaction'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { approveRendition } from '@/features/renditions/approvals'
import { createRelease } from '@/features/rtk/releases'
import { closeRequest, logRequest } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
import { recordWithholding } from '@/features/rtk/withholdings'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { addDays, type CivilDate } from '@/types/civilDate'

export interface RtkSeedContext {
  db: Db
  store: ObjectStore
  signal: AbortSignal
  now: Date
  today: CivilDate
  custodian: Actor
  staff: Actor
}

export function businessDaysBefore(today: CivilDate, days: number): CivilDate {
  return computeDue({
    start: today,
    length: { unit: 'business_days', value: days },
    direction: 'before',
    clockType: 'notice_lead',
    holidays: packHolidayCalendar(),
  }).due
}

async function logAt(
  ctx: RtkSeedContext,
  receivedOn: CivilDate,
  description: string,
  requesterName: string,
): Promise<string> {
  const logged = must(
    await logRequest(
      ctx.db,
      ctx.custodian,
      {
        receivedOn,
        receivedVia: 'email',
        requesterName,
        requesterContact: `${requesterName.split(' ')[0]?.toLowerCase() ?? 'requester'}@example.test`,
        description,
      },
      ctx.signal,
      ctx.now,
    ),
    'log a Right-to-Know request',
  )
  return logged.requestId
}

export async function seedRtkRequests(ctx: RtkSeedContext): Promise<void> {
  await logAt(
    ctx,
    businessDaysBefore(ctx.today, 2),
    'Minutes and recordings of the last three Planning Board meetings',
    'Morgan Ellis',
  )
  await logAt(
    ctx,
    addDays(ctx.today, -14),
    'All building permit applications for Birch Lane since January',
    'Jordan Reyes',
  )
  const waiting = await logAt(
    ctx,
    addDays(ctx.today, -9),
    'Correspondence between the town and the highway contractor about the Mill Road culvert',
    'Casey Brandt',
  )
  must(
    await recordWithholding(
      ctx.db,
      ctx.custodian,
      {
        requestId: waiting,
        scope: 'withheld_in_full',
        recordDescription: 'Email from the town attorney about the culvert contract dispute',
        exemptionKey: 'nh.rtk.91a5.xii',
        explanation: 'The email is a confidential communication seeking legal advice from counsel.',
      },
      ctx.signal,
    ),
    'record a withholding',
  )
  must(
    await recordFirstResponse(
      ctx.db,
      ctx.store,
      ctx.custodian,
      {
        requestId: waiting,
        kind: 'time_statement',
        respondedOn: addDays(ctx.today, -5),
        timeStatement: {
          statedDate: addDays(ctx.today, 10),
          delayReason:
            'The correspondence is spread across several mailboxes and needs review before release.',
          costEstimate: [{ label: 'Staff time to search and copy', cents: 2500 }],
        },
      },
      ctx.signal,
      ctx.now,
    ),
    'answer a request with a time statement',
  )
}

export async function seedClosedRequestWithReleases(ctx: RtkSeedContext): Promise<void> {
  const requestId = await logAt(
    ctx,
    addDays(ctx.today, -25),
    'Letters and permits for the Birch Lane renovation',
    'Riley Chen',
  )
  const letter = await seedLetterDocument(ctx, 'Owner letter for the Birch Lane renovation')
  const redactedId = await seedRedactedVersion(ctx, letter, 'rtk_release', requestId)
  const redactedApproval = must(
    await approveRendition(
      ctx.db,
      ctx.custodian,
      {
        versionId: redactedId,
        purpose: 'rtk_release',
        rtkRequestId: requestId,
        reviewStatement: 'Checked every page against the boxes drawn.',
      },
      ctx.signal,
      ctx.store,
    ),
    'approve the redacted release copy',
  )
  must(
    await recordWithholding(
      ctx.db,
      ctx.custodian,
      {
        requestId,
        scope: 'withheld_in_full',
        recordDescription: 'Email from the town attorney about the Birch Lane variance',
        exemptionKey: 'nh.rtk.91a5.xii',
        explanation: 'The email is a confidential communication seeking legal advice from counsel.',
      },
      ctx.signal,
    ),
    'withhold a record in full',
  )
  const mail = createMemoryTransport()
  must(
    await createRelease(
      ctx.db,
      ctx.store,
      mail,
      ctx.custodian,
      {
        requestId,
        releasedOn: addDays(ctx.today, -20),
        method: 'paper',
        items: [{ documentId: letter.documentId, approvalId: redactedApproval.approvalId }],
      },
      ctx.signal,
      ctx.now,
    ),
    'make the first release',
  )
  const second = await seedLetterDocument(
    ctx,
    'Permit correspondence for the Birch Lane renovation',
  )
  const secondApproval = must(
    await approveRendition(
      ctx.db,
      ctx.custodian,
      {
        versionId: second.versionId,
        purpose: 'rtk_release',
        rtkRequestId: requestId,
        reviewStatement: 'Nothing in this letter is exempt from disclosure.',
      },
      ctx.signal,
      ctx.store,
    ),
    'approve the second release',
  )
  must(
    await createRelease(
      ctx.db,
      ctx.store,
      mail,
      ctx.custodian,
      {
        requestId,
        releasedOn: addDays(ctx.today, -18),
        method: 'electronic_link',
        recipientEmail: 'riley@example.test',
        items: [{ documentId: second.documentId, approvalId: secondApproval.approvalId }],
      },
      ctx.signal,
      ctx.now,
    ),
    'make the second release',
  )
  const [row] = await ctx.db.select().from(rtkRequests).where(eq(rtkRequests.id, requestId))
  must(
    await closeRequest(
      ctx.db,
      ctx.custodian,
      { requestId, to: 'closed', expectedRowVersion: row?.rowVersion ?? 0 },
      ctx.signal,
    ),
    'close the request',
  )
}

export async function seedRecordsM10(
  db: Db,
  store: ObjectStore,
  signal: AbortSignal,
  now: Date,
): Promise<boolean> {
  signal.throwIfAborted()
  const [existing] = await db.select({ n: count() }).from(rtkRequests)
  if ((existing?.n ?? 0) > 0) return false
  const ctx: RtkSeedContext = {
    db,
    store,
    signal,
    now,
    today: await townToday(db, now, signal),
    custodian: await actorFor(db, 'records', signal),
    staff: await actorFor(db, 'staff', signal),
  }
  await seedRtkRequests(ctx)
  await seedClosedRequestWithReleases(ctx)
  await seedDispositionDemo(ctx)
  const letter = await seedLetterDocument(ctx, 'Demo letter with a private phone number')
  await seedRedactedVersion(ctx, letter, 'public')
  return true
}
