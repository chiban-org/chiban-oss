import { eq } from 'drizzle-orm'
import { applications } from '@/db/schema'
import { transitionApplication } from '@/features/applications/transition'
import type { EnforcementSeedContext } from '@/features/demo/seedEnforcementSupport'
import {
  actorFor,
  type Cast,
  completeAndReview,
  must,
  noon,
  open,
  readyToIssue,
} from '@/features/demo/seedPermitSupport'
import { expireLapsedPermits } from '@/jobs/clocksDaily'

const ALARM_VALUES = {
  description: 'Burglar alarm for the main house',
  alarm_company: 'Granite State Security',
  emergency_contact: 'Pat Owner, 603-555-0142',
}

const TEMPORARY_VALUES = {
  description: 'Event tent for a summer wedding',
  structure_kind: 'Event tent',
  footprint_sq_ft: '1200',
}

export async function seedRegistrations(ctx: EnforcementSeedContext): Promise<void> {
  const { db, signal } = ctx
  const cast: Cast = {
    admin: ctx.admin,
    staff: ctx.staff,
    applicant: await actorFor(db, 'applicant', signal),
  }
  const alarmOn = ctx.day(-30)
  const alarm = await open(db, cast, signal, {
    parcel: '007001000000',
    title: 'Alarm system registration',
    typeKey: 'AR',
    values: ALARM_VALUES,
    submittedOn: alarmOn,
  })
  await alarm.step('issued', alarmOn)

  const submitted = ctx.day(-205)
  const issued = ctx.day(-200)
  const tent = await open(db, cast, signal, {
    parcel: '007001000000',
    title: 'Temporary event tent',
    typeKey: 'TS',
    values: TEMPORARY_VALUES,
    submittedOn: submitted,
  })
  await completeAndReview(tent, ctx.day(-204), ctx.day(-203))
  await readyToIssue(tent, ctx.day(-201))
  await tent.step('issued', issued)
  const swept = await db.transaction((tx) => expireLapsedPermits(tx, ctx.today, signal))
  if (swept.length > 0) must({ ok: false as const, error: swept }, 'expire the lapsed tent')
  const [row] = await db.select().from(applications).where(eq(applications.id, tent.applicationId))
  if (row?.state === 'issued') {
    must(
      await db.transaction((tx) =>
        transitionApplication(
          tx,
          ctx.staff,
          {
            applicationId: tent.applicationId,
            to: 'expired',
            expectedRowVersion: row.rowVersion,
            onDate: ctx.today,
          },
          signal,
          noon(ctx.today),
        ),
      ),
      'expire the tent',
    )
  }
}
