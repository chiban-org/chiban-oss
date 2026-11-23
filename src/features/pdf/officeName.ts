import type { DbOrTx } from '@/db/client'
import { loadTownProfile } from '@/features/pdf/documentFrame'
import type { TownProfileBody } from '@/features/town/profileSchema'

const FALLBACK_OFFICE_NAME = 'land use office'

export function officeNameOf(profile: Pick<TownProfileBody, 'officeName'> | null): string {
  return profile?.officeName ?? FALLBACK_OFFICE_NAME
}

export async function loadOfficeName(db: DbOrTx, signal: AbortSignal): Promise<string> {
  return officeNameOf(await loadTownProfile(db, signal))
}
