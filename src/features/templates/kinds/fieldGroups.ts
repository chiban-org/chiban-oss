import { allowedFields } from '@/features/templates/kinds/documentKinds'
import { mergeFieldLabel } from '@/features/templates/mergeFieldLabels'
import { MERGE_FIELDS } from '@/features/templates/mergeFields'
import type { TemplateKind } from '@/features/templates/templateSchema'

export interface FieldGroup {
  title: string
  fields: { name: string; label: string }[]
}

const GROUP_OF_PREFIX: ReadonlyMap<string, string> = new Map([
  ['application', 'Application'],
  ['parcel', 'Application'],
  ['project', 'Application'],
  ['party', 'Application'],
  ['fees', 'Application'],
  ['conditions', 'Application'],
  ['codeEdition', 'Application'],
  ['permit', 'Application'],
  ['certificate', 'Certificate'],
  ['board', 'Meeting and notice'],
  ['meeting', 'Meeting and notice'],
  ['hearing', 'Meeting and notice'],
  ['notice', 'Meeting and notice'],
  ['decision', 'Decision'],
  ['order', 'Order'],
  ['case', 'Case'],
  ['rtk', 'Request'],
  ['receipt', 'Receipt'],
  ['packet', 'Packet'],
])

const TOWN_GROUP = 'Town and signers'

function groupOf(name: string): string {
  return GROUP_OF_PREFIX.get(name.split('.')[0] ?? '') ?? TOWN_GROUP
}

export function fieldGroups(kind: TemplateKind): FieldGroup[] {
  const allowed = allowedFields(kind)
  const groups = new Map<string, FieldGroup>()
  for (const name of MERGE_FIELDS) {
    if (!allowed.has(name)) continue
    const title = groupOf(name)
    const group = groups.get(title) ?? { title, fields: [] }
    group.fields.push({ name, label: mergeFieldLabel(name) })
    groups.set(title, group)
  }
  const ordered = [...groups.values()]
  return [
    ...ordered.filter((g) => g.title !== TOWN_GROUP),
    ...ordered.filter((g) => g.title === TOWN_GROUP),
  ]
}
