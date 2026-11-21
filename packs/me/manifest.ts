import { ME_ABUTTER_PARAMS } from '@packs/me/abutters/params'
import { ME_CLASSIFICATIONS } from '@packs/me/classifications'
import { ME_CODE_EDITIONS } from '@packs/me/codeEditions'
import { ME_RECORD_SERIES, ME_RECORD_SERIES_DEFAULTS } from '@packs/me/recordSeries'
import { ME_ROLES } from '@packs/me/roles'
import { BUILDING_RULES } from '@packs/me/rules/building'
import { LOCAL_PERMIT_RULES } from '@packs/me/rules/localPermits'
import { PLUMBING_RULES } from '@packs/me/rules/plumbing'
import { FOAA_RULES } from '@packs/me/rules/rightToKnow'
import type { PackManifest } from '@/features/packs/schema'

export const ME_PACK_MANIFEST: PackManifest = {
  id: 'me',
  version: '0.9.0',
  rules: [...BUILDING_RULES, ...LOCAL_PERMIT_RULES, ...PLUMBING_RULES, ...FOAA_RULES],
  classifications: ME_CLASSIFICATIONS,
  codeEditions: ME_CODE_EDITIONS,
  recordSeries: ME_RECORD_SERIES,
  recordSeriesDefaults: ME_RECORD_SERIES_DEFAULTS,
  abutterParams: [ME_ABUTTER_PARAMS],
  roles: ME_ROLES,
}
