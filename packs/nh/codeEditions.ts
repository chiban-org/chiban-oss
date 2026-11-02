import type { CodeEditionEntry } from '@packs/nh/schema'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const RSA_155A_1 = {
  label: 'RSA 155-A:1 IV',
  url: 'https://gc.nh.gov/rsa/html/XII/155-A/155-A-1.htm',
} as const

export const NH_UNVERIFIED_EDITION_KEY = 'nh.edition.unverified_before_2024_07_01'
export const NH_CURRENT_EDITION_KEY = 'nh.edition.2024_07_01'

export const NH_CODE_EDITIONS: CodeEditionEntry[] = [
  {
    key: NH_UNVERIFIED_EDITION_KEY,
    label: 'Edition not verified (before 2024-07-01)',
    status: 'unverified',
    effectiveFrom: d('1970-01-01'),
    enforcementFrom: null,
    components: [],
    amendmentPackages: [],
    electionWindow: null,
    citation: RSA_155A_1,
  },
  {
    key: NH_CURRENT_EDITION_KEY,
    label:
      'IBC 2021, IEBC 2021, IPC 2021, IMC 2021, IECC 2018, IRC 2021, ISPSC 2021, NEC 2023 (effective 2024-07-01)',
    status: 'verified',
    effectiveFrom: d('2024-07-01'),
    enforcementFrom: d('2025-01-01'),
    components: [
      { code: 'IBC', edition: '2021' },
      { code: 'IEBC', edition: '2021' },
      { code: 'IPC', edition: '2021' },
      { code: 'IMC', edition: '2021' },
      { code: 'IECC', edition: '2018' },
      { code: 'IRC', edition: '2021' },
      { code: 'ISPSC', edition: '2021' },
      { code: 'NEC', edition: '2023' },
    ],
    amendmentPackages: [
      { effectiveFrom: d('2025-07-01'), label: 'State amendments effective 2025-07-01' },
      { effectiveFrom: d('2025-10-15'), label: 'State amendments effective 2025-10-15' },
    ],
    electionWindow: { until: d('2024-12-31'), mayElect: [NH_UNVERIFIED_EDITION_KEY] },
    citation: RSA_155A_1,
  },
]
