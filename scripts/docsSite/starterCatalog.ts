import type { BoardKind } from '@packs/nh/boardSchema'
import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { NH_PACK_MANIFEST } from '@packs/nh/manifest'
import type { ProceedingClassification } from '@packs/nh/schema'
import { NH_STARTERS, type StarterBundle } from '@packs/nh/starters'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { type DocumentItem, documentStageLabel } from '@/features/applications/documentItemSchema'
import { generatedFrontMatter } from '@/lib/generatedFrontMatter'
import { feeLineText, fieldLabels } from './feeText'
import { escapeText, joinBlocks } from './markdown'

export const STARTER_CATALOG_PATH =
  'docs-site/docs/state-packs/new-hampshire/_generated/starters.md'

interface StarterGroup {
  title: string
  includes: (classification: ProceedingClassification) => boolean
}

const BUILDING_AND_TRADE = new Set(['nh.building_permit', 'nh.trade_permit'])

const GROUPS: readonly StarterGroup[] = [
  { title: 'Building and trade permits', includes: (c) => BUILDING_AND_TRADE.has(c.key) },
  { title: 'Planning Board applications', includes: (c) => c.boardKind === 'planning_board' },
  { title: 'Zoning Board of Adjustment applications', includes: (c) => c.boardKind === 'zba' },
  {
    title: 'Local permits and registrations',
    includes: (c) => c.boardKind === null && !BUILDING_AND_TRADE.has(c.key),
  },
]

const DECIDED_BY: ReadonlyMap<BoardKind, string> = new Map([
  ['planning_board', 'The Planning Board decides it.'],
  ['zba', 'The Zoning Board of Adjustment decides it.'],
])

const CLOCK_LABELS: ReadonlyMap<string, string> = new Map(
  NH_PACK_MANIFEST.rules.flatMap((rule) => (rule.kind === 'clock' ? [[rule.key, rule.label]] : [])),
)

function classificationOf(starter: StarterBundle): ProceedingClassification {
  const found = NH_CLASSIFICATIONS.find((c) => c.key === starter.applicationType.classification)
  if (found === undefined) {
    throw new AppError(ErrorIds.PACK_INVALID, 'starter names an unknown classification', {
      starter: starter.id,
      classification: starter.applicationType.classification,
    })
  }
  return found
}

function documentText(doc: DocumentItem): string {
  const when = [
    documentStageLabel(doc.stage).toLowerCase(),
    ...(doc.requiredIf === undefined ? [] : ['when it applies']),
    ...(doc.optional === true ? ['optional'] : []),
  ]
  return `${doc.label} (${when.join(', ')})`
}

function bullets(items: readonly string[]): string {
  return items.map((item) => `  - ${escapeText(item)}`).join('\n')
}

function deadlinesOf(starter: StarterBundle, classification: ProceedingClassification): string[] {
  const keys = [...classification.mandatoryRuleKeys, ...starter.applicationType.bindings]
  return [...new Set(keys)].flatMap((key) => {
    const label = CLOCK_LABELS.get(key)
    return label === undefined ? [] : [label]
  })
}

function starterBlock(starter: StarterBundle): string {
  const classification = classificationOf(starter)
  const type = starter.applicationType
  const labels = fieldLabels(starter.form)
  const decidedBy =
    classification.boardKind === null
      ? 'No board hears it.'
      : (DECIDED_BY.get(classification.boardKind) ?? 'A town board hears it.')
  const documents = (type.documents ?? []).map(documentText)
  const inspections = starter.checklists.map((checklist) => checklist.label)
  const deadlines = deadlinesOf(starter, classification)
  const facts = [
    `- **Type:** ${escapeText(classification.label)}. ${decidedBy} Numbers start with ${type.prefix}.`,
    `- **Fees:**\n${bullets(starter.feeSchedule.lines.map((line) => feeLineText(line, labels)))}`,
    documents.length === 0 ? '' : `- **Documents the applicant provides:**\n${bullets(documents)}`,
    inspections.length === 0 ? '' : `- **Inspections:**\n${bullets(inspections)}`,
    deadlines.length === 0 ? '' : `- **Deadlines Chiban tracks:**\n${bullets(deadlines)}`,
  ].filter((line) => line !== '')
  return joinBlocks([`### ${escapeText(type.label)}`, facts.join('\n')]).trimEnd()
}

export function renderStarterCatalog(): string {
  for (const starter of NH_STARTERS) {
    const homes = GROUPS.filter((group) => group.includes(classificationOf(starter))).length
    if (homes !== 1) {
      throw new AppError(ErrorIds.PACK_INVALID, 'starter must belong to one catalog group', {
        starter: starter.id,
        groups: homes,
      })
    }
  }
  const sections = GROUPS.map((group) => {
    const members = NH_STARTERS.filter((starter) => group.includes(classificationOf(starter)))
    return members.length === 0
      ? ''
      : joinBlocks([`## ${group.title}`, ...members.map(starterBlock)]).trimEnd()
  })
  const frontMatter = generatedFrontMatter({
    sources: [
      'packs/nh/starters/index.ts',
      'packs/nh/classifications.ts',
      'packs/nh/manifest.ts',
      'src/features/fees/feeRows.ts',
      'src/features/applications/documentItemSchema.ts',
    ],
  })
  return `${frontMatter}${joinBlocks(sections)}`
}
