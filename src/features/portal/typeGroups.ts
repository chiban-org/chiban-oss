import { boardKindOf } from '@/features/applications/applicationTypeSchema'

export interface GroupableType {
  key: string
  label: string
  classification?: string | undefined
}

export interface CommonJob {
  key: string
  title: string
  description: string
}

export interface TypeGroup {
  title: string
  types: GroupableType[]
}

const COMMON_JOBS: readonly CommonJob[] = [
  {
    key: 'BP',
    title: 'Build, add on or tear down',
    description: 'A new building, an addition, a deck, garage, shed or fence, or a demolition.',
  },
  {
    key: 'EL',
    title: 'Electrical work',
    description: 'Wiring, a new service or panel, or a generator.',
  },
  {
    key: 'PL',
    title: 'Plumbing',
    description: 'New or moved fixtures, a water heater, or water and drain piping.',
  },
  {
    key: 'MG',
    title: 'Gas or heating equipment',
    description: 'Gas piping, a furnace or boiler, or other fuel-burning equipment.',
  },
  {
    key: 'DW',
    title: 'Driveway',
    description: 'A new driveway, or a change where one meets the road.',
  },
  { key: 'SG', title: 'Sign', description: 'A new sign, or a change to an existing one.' },
]

const BUILDING_OFFICE = new Set(['nh.building_permit', 'nh.trade_permit'])
const GROUP_ORDER = ['Building office', 'Planning Board', 'Zoning Board', 'Registrations and other']

function groupOf(type: GroupableType): string {
  const board = boardKindOf(type.classification)
  if (board === 'planning_board') return 'Planning Board'
  if (board === 'zba') return 'Zoning Board'
  return BUILDING_OFFICE.has(type.classification ?? '')
    ? 'Building office'
    : 'Registrations and other'
}

export function groupPortalTypes(types: readonly GroupableType[]): {
  common: CommonJob[]
  groups: TypeGroup[]
} {
  const published = new Set(types.map((t) => t.key))
  const common = COMMON_JOBS.filter((job) => published.has(job.key))
  const commonKeys = new Set(common.map((c) => c.key))
  const rest = types.filter((t) => !commonKeys.has(t.key))
  const groups = GROUP_ORDER.map((title) => ({
    title,
    types: rest.filter((t) => groupOf(t) === title),
  })).filter((g) => g.types.length > 0)
  return { common, groups }
}
