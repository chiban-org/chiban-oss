import { createUspsClient, type UspsLookup } from '@/features/usps/uspsClient'
import { uspsStub } from '@/features/usps/uspsStub'
import type { UspsDeps } from '@/features/usps/uspsToken'

export interface UspsSettings {
  USPS_STUB: boolean
  USPS_API_BASE: string
  USPS_CLIENT_ID?: string | undefined
  USPS_CLIENT_SECRET?: string | undefined
}

export function chooseLookup(settings: UspsSettings, deps: UspsDeps): UspsLookup | null {
  if (settings.USPS_STUB) return uspsStub
  if (settings.USPS_CLIENT_ID === undefined || settings.USPS_CLIENT_SECRET === undefined) {
    return null
  }
  return createUspsClient(
    {
      clientId: settings.USPS_CLIENT_ID,
      clientSecret: settings.USPS_CLIENT_SECRET,
      apiBase: settings.USPS_API_BASE.replace(/\/+$/, ''),
    },
    deps,
  )
}
