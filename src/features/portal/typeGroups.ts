import { boardKindOf } from '@/features/applications/applicationTypeSchema'
import { activePack } from '@/features/packs/registry'
import { boardShort } from '@/features/packs/vocabulary'

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

function groupOrder(): string[] {
  return [
    'Building office',
    boardShort('planning_board'),
    boardShort('zba'),
    'Registrations and other',
  ]
}

function groupOf(type: GroupableType): string {
  const board = boardKindOf(type.classification)
  if (board === 'planning_board') return boardShort('planning_board')
  if (board === 'zba') return boardShort('zba')
  const office = activePack().portal.officeClassifications
  return type.classification !== undefined && office.includes(type.classification)
    ? 'Building office'
    : 'Registrations and other'
}

export function groupPortalTypes(types: readonly GroupableType[]): {
  common: CommonJob[]
  groups: TypeGroup[]
} {
  const published = new Set(types.map((t) => t.key))
  const common = activePack().portal.commonJobs.filter((job) => published.has(job.key))
  const commonKeys = new Set(common.map((c) => c.key))
  const rest = types.filter((t) => !commonKeys.has(t.key))
  const groups = groupOrder()
    .map((title) => ({
      title,
      types: rest.filter((t) => groupOf(t) === title),
    }))
    .filter((g) => g.types.length > 0)
  return { common, groups }
}
