import type { Db } from '@/db/client'
import { seedApplicationStates } from '@/features/demo/seedApplicationStates'
import { seedMeetingStates } from '@/features/demo/seedMeetingStates'
import { actorFor, type Cast } from '@/features/demo/seedPermitSupport'
import { seedRecordStates } from '@/features/demo/seedRecordStates'
import { seedTodayWork } from '@/features/demo/seedToday'
import { seedUserStates } from '@/features/demo/seedUserStates'
import type { MailTransport } from '@/features/mail/transport'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'

export interface CoverageContext {
  db: Db
  store: ObjectStore
  mail: MailTransport
  signal: AbortSignal
  now: Date
  today: CivilDate
  cast: Cast
}

export async function seedCoverage(
  db: Db,
  deps: { store: ObjectStore; mail: MailTransport; now: Date },
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const ctx: CoverageContext = {
    db,
    ...deps,
    signal,
    today: await townToday(db, deps.now, signal),
    cast: {
      admin: await actorFor(db, 'admin', signal),
      staff: await actorFor(db, 'staff', signal),
      applicant: await actorFor(db, 'applicant', signal),
    },
  }
  const steps = [
    await seedMeetingStates(ctx),
    await seedApplicationStates(ctx),
    await seedRecordStates(ctx),
    await seedTodayWork(ctx),
    await seedUserStates(ctx),
  ]
  return steps.some(Boolean)
}
