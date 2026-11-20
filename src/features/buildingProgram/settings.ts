import type { DbOrTx } from '@/db/client'
import type { BuildingProgramBody } from '@/features/buildingProgram/schema'
import { getPublished } from '@/features/config/store'
import { activePack } from '@/features/packs/registry'

export async function getBuildingProgram(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<BuildingProgramBody> {
  const published = await getPublished(db, 'building_program', 'default', signal)
  return published === null
    ? {
        key: 'default',
        permitsEnabled: true,
        codeChoice: activePack().buildingCodes.defaultChoice,
        residents: null,
      }
    : (published.body as BuildingProgramBody)
}
