import { NH_STARTERS } from '@packs/nh/starters'
import type { Db } from '@/db/client'
import { boardMeetings } from '@/db/schema'
import { adoptStarter } from '@/features/config/adoptStarter'
import {
  seedGrantedVariance,
  seedMinorSitePlan,
  seedPendingVariance,
  seedSitePlan,
  VARIANCE_VALUES,
} from '@/features/demo/seedBoardApps'
import {
  importScenarioParcels,
  publishBoardConfig,
  SCENARIO_LOTS,
  scheduleBoardMeetings,
  seedRosters,
} from '@/features/demo/seedBoardData'
import { decideGrantedVariance, seedHearings, seedMembers } from '@/features/demo/seedHearings'
import { actorFor, type Cast, must } from '@/features/demo/seedPermitSupport'
import { seatStaffBoardMember } from '@/features/demo/seedStaffSeat'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { todayInTimeZone } from '@/types/civilDate'

const TOWN_ZONE = 'America/New_York'

async function scenarioIds(db: Db, signal: AbortSignal): Promise<Record<string, string>> {
  const ids: Record<string, string> = {}
  for (const [name, lot] of Object.entries(SCENARIO_LOTS)) {
    const value = `009${String(lot).padStart(3, '0')}000000`
    const found = await resolveParcelId(db, { format: 'gis12', value }, signal)
    if (found.ok) ids[name] = found.value.parcelId
  }
  return ids
}

export async function seedBoards(
  db: Db,
  signal: AbortSignal,
  now: Date = new Date(),
  store: ObjectStore = getObjectStore(),
): Promise<boolean> {
  signal.throwIfAborted()
  const cast: Cast = {
    admin: await actorFor(db, 'admin', signal),
    staff: await actorFor(db, 'staff', signal),
    applicant: await actorFor(db, 'applicant', signal),
  }
  await seatStaffBoardMember(db, cast, signal)
  const existing = await db.select({ id: boardMeetings.id }).from(boardMeetings).limit(1)
  if (existing.length > 0) return false
  for (const starter of NH_STARTERS) {
    const adopted = await adoptStarter(db, cast.admin, starter.id, signal)
    if (!adopted.ok && adopted.error !== 'already_adopted') must(adopted, `adopt ${starter.id}`)
  }
  await publishBoardConfig(db, cast.admin, signal)
  await scheduleBoardMeetings(db, cast.staff, signal)
  await importScenarioParcels(db, cast.staff, signal)
  const ids = await scenarioIds(db, signal)
  await seedRosters(db, cast.staff, ids, todayInTimeZone(TOWN_ZONE, now), signal)
  const sitePlan = await seedSitePlan(db, cast, signal, now)
  await seedMinorSitePlan(db, cast, signal, now)
  await seedPendingVariance(db, cast, signal, now)
  await seedMembers(db, cast, signal)
  await seedGrantedVariance(db, cast, signal, now, sitePlan, (applicationId) =>
    decideGrantedVariance(db, store, cast, applicationId, signal, now),
  )
  await seedHearings(db, store, cast, { sitePlan }, VARIANCE_VALUES, signal, now)
  return true
}
