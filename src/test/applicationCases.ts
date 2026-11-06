import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications } from '@/db/schema'
import type { CoreState } from '@/features/applications/states'
import {
  type ApplicationPatch,
  makeApplication,
  type PermitWorld,
} from '@/test/applicationFixtures'

export const RECEIVED_ON = new Date('2026-06-01T15:00:00Z')

export interface CaseApplication {
  applicationId: string
  rowVersion: number
}

export async function applicationIn(
  db: Db,
  world: PermitWorld,
  state: CoreState,
  patch: ApplicationPatch = {},
  typeKey = 'BP',
): Promise<CaseApplication> {
  const made = await makeApplication(db, world, { state, ...patch }, RECEIVED_ON, typeKey)
  const [row] = await db
    .select({ rowVersion: applications.rowVersion })
    .from(applications)
    .where(eq(applications.id, made.applicationId))
  return { applicationId: made.applicationId, rowVersion: row?.rowVersion ?? 0 }
}
