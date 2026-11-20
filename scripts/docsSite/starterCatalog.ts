import { AppError, ErrorIds } from '@/constants/errorIds'
import { type DocumentItem, documentStageLabel } from '@/features/applications/documentItemSchema'
import { activePack } from '@/features/packs/registry'
import { presentKeys } from '@/features/packs/roles'
import type { ProceedingClassification, StarterBundle } from '@/features/packs/schema'
import { boardLabel } from '@/features/packs/vocabulary'
import { generatedFrontMatter } from '@/lib/generatedFrontMatter'
import { feeLineText, fieldLabels } from './feeText'
import { escapeText, joinBlocks } from './markdown'
import { generatedDir } from './stateDeadlines'

export function starterCatalogPath(): string {
  return `${generatedDir()}/starters.md`
}

interface StarterGroup {
  title: string
  includes: (classification: ProceedingClassification) => boolean
}

function buildingOrTrade(c: ProceedingClassification): boolean {
  const { classifications } = activePack().manifest.roles
  return presentKeys([classifications.buildingPermit, classifications.tradePermit]).includes(c.key)
}

function groups(): readonly StarterGroup[] {
  return [
    { title: 'Building and trade permits', includes: buildingOrTrade },
    {
      title: `${boardLabel('planning_board')} applications`,
      includes: (c) => c.boardKind === 'planning_board',
    },
    { title: `${boardLabel('zba')} applications`, includes: (c) => c.boardKind === 'zba' },
    {
      title: 'Local permits and registrations',
      includes: (c) => c.boardKind === null && !buildingOrTrade(c),
    },
  ]
}

function decidedByText(classification: ProceedingClassification): string {
  const { boardKind } = classification
  if (boardKind === null) return 'No board hears it.'
  if (boardKind === 'planning_board' || boardKind === 'zba') {
    return `The ${boardLabel(boardKind)} decides it.`
  }
  return 'A town board hears it.'
}

function clockLabels(): ReadonlyMap<string, string> {
  return new Map(
    activePack().manifest.rules.flatMap((rule) =>
      rule.kind === 'clock' ? [[rule.key, rule.label]] : [],
    ),
  )
}

function classificationOf(starter: StarterBundle): ProceedingClassification {
  const found = activePack().manifest.classifications.find(
    (c) => c.key === starter.applicationType.classification,
  )
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
  const labels = clockLabels()
  return [...new Set(keys)].flatMap((key) => {
    const label = labels.get(key)
    return label === undefined ? [] : [label]
  })
}

function starterBlock(starter: StarterBundle): string {
  const classification = classificationOf(starter)
  const type = starter.applicationType
  const labels = fieldLabels(starter.form)
  const decidedBy = decidedByText(classification)
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
  const starters = activePack().starters
  const allGroups = groups()
  for (const starter of starters) {
    const homes = allGroups.filter((group) => group.includes(classificationOf(starter))).length
    if (homes !== 1) {
      throw new AppError(ErrorIds.PACK_INVALID, 'starter must belong to one catalog group', {
        starter: starter.id,
        groups: homes,
      })
    }
  }
  const sections = allGroups.map((group) => {
    const members = starters.filter((starter) => group.includes(classificationOf(starter)))
    return members.length === 0
      ? ''
      : joinBlocks([`## ${group.title}`, ...members.map(starterBlock)]).trimEnd()
  })
  const root = `packs/${activePack().manifest.id}`
  const frontMatter = generatedFrontMatter({
    sources: [
      `${root}/starters/index.ts`,
      `${root}/classifications.ts`,
      `${root}/manifest.ts`,
      'src/features/fees/feeRows.ts',
      'src/features/applications/documentItemSchema.ts',
    ],
  })
  return `${frontMatter}${joinBlocks(sections)}`
}
