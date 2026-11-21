import { ME_URLS } from '@packs/me/rules/urls'
import type { CodeEditionEntry } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

export const ME_2015_EDITION_KEY = 'me.edition.2018_01_23'
export const ME_2021_EDITION_KEY = 'me.edition.2025_04_07'

export const ME_CODE_EDITIONS: CodeEditionEntry[] = [
  {
    key: ME_2015_EDITION_KEY,
    label: 'IBC 2015, IEBC 2015, IRC 2015 (effective 2018-01-23)',
    status: 'verified',
    effectiveFrom: d('2018-01-23'),
    enforcementFrom: d('2018-04-23'),
    components: [
      { code: 'IBC', edition: '2015' },
      { code: 'IEBC', edition: '2015' },
      { code: 'IRC', edition: '2015' },
    ],
    amendmentPackages: [
      { effectiveFrom: d('2021-05-10'), label: 'IECC 2015 and IMC 2015 effective 2021-05-10' },
    ],
    electionWindow: null,
    citation: { label: '16-642 CMR ch 1, filing 2018-006', url: ME_URLS.rulesAdopted2018 },
  },
  {
    key: ME_2021_EDITION_KEY,
    label:
      'IBC 2021, IRC 2021, IEBC 2021, IECC 2021, IMC 2021, ASHRAE 62.1, 62.2 and 90.1 2019 (effective 2025-04-07)',
    status: 'verified',
    effectiveFrom: d('2025-04-07'),
    enforcementFrom: null,
    components: [
      { code: 'IBC', edition: '2021' },
      { code: 'IRC', edition: '2021' },
      { code: 'IEBC', edition: '2021' },
      { code: 'IECC', edition: '2021' },
      { code: 'IMC', edition: '2021' },
      { code: 'ASHRAE 62.1', edition: '2019' },
      { code: 'ASHRAE 62.2', edition: '2019' },
      { code: 'ASHRAE 90.1', edition: '2019' },
    ],
    amendmentPackages: [],
    electionWindow: null,
    citation: {
      label:
        'MUBEC Standards and Amendments, effective beginning April 7, 2025; 08-003 CMR ch 2 (formerly 16-642 CMR ch 1)',
      url: ME_URLS.mubecStandards,
    },
  },
]
