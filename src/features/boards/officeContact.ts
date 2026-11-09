import type { DbOrTx } from '@/db/client'
import { loadTownProfile } from '@/features/pdf/documentFrame'

export interface OfficeContact {
  officeName: string
  phone: string | null
  email: string | null
}

const FALLBACK: OfficeContact = { officeName: 'Land Use Office', phone: null, email: null }

function filled(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export async function officeContact(db: DbOrTx, signal: AbortSignal): Promise<OfficeContact> {
  const profile = await loadTownProfile(db, signal)
  if (profile === null) return FALLBACK
  return {
    officeName: profile.officeName,
    phone: filled(profile.phone),
    email: filled(profile.email),
  }
}
