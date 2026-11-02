import { count } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { computeDue } from '@/features/clocks/computeDue'
import { actorFor, must } from '@/features/demo/seedPermitSupport'
import { seedLetterDocument, seedRedactedVersion } from '@/features/demo/seedRedaction'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { logRequest } from '@/features/rtk/requests'
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
  const letter = await seedLetterDocument(ctx, 'Demo letter with a private phone number')
  await seedRedactedVersion(ctx, letter, 'public')
  return true
}
