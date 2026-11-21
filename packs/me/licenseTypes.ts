import type { LicenseLookup, LicenseTypeGroup } from '@/features/packs/schema'

export const ME_LICENSE_TYPES: readonly LicenseTypeGroup[] = []

export function meDefaultLicenseType(_applicationTypeKey: string): string | null {
  return null
}

export const ME_LICENSE_LOOKUP: LicenseLookup | null = null
