import { activePack } from '@/features/packs/registry'
import type { LicenseLookup } from '@/features/packs/schema'

export interface LicenseGroup {
  label: string
  licenses: readonly string[]
}

export function licenseGroups(): LicenseGroup[] {
  return activePack().licenseTypes.map((group) => ({
    label: group.label,
    licenses: group.licenses,
  }))
}

export function defaultLicenseType(applicationTypeKey: string): string | null {
  return activePack().defaultLicenseType(applicationTypeKey)
}

export function licenseLookup(): LicenseLookup | null {
  return activePack().licenseLookup
}

export function licenseLookupUrl(): string {
  return licenseLookup()?.url ?? ''
}
