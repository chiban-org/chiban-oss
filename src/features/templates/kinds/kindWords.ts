import type { Vocabulary } from '@/features/packs/vocabulary'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import { rtkResponseWords } from '@/features/templates/kinds/officeKinds'
import type { TemplateKind } from '@/features/templates/templateSchema'

type KindWords = Pick<Vocabulary, 'recordsLaw' | 'recordsRequest'>

export function kindLabel(kind: TemplateKind, words: KindWords): string {
  return kind === 'rtk_response' ? rtkResponseWords(words).label : documentKind(kind).label
}

export function kindRecord(kind: TemplateKind, words: KindWords): string {
  return kind === 'rtk_response' ? rtkResponseWords(words).record : documentKind(kind).record
}
