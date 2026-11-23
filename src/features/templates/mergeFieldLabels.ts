import { packVocabulary } from '@/features/packs/vocabulary'
import { MERGE_FIELDS, type MergeField } from '@/features/templates/mergeFields'
import {
  type MergeFieldWords,
  mergeFieldLabelFor,
  mergeFieldLabelsFor,
} from '@/features/templates/mergeFieldWords'

export const MERGE_FIELD_LABELS = Object.defineProperties(
  {},
  Object.fromEntries(
    MERGE_FIELDS.map((name) => [
      name,
      { enumerable: true, get: () => mergeFieldLabelsFor(packVocabulary())[name] },
    ]),
  ),
) as Record<MergeField, string>

export function mergeFieldLabel(name: string, words: MergeFieldWords = packVocabulary()): string {
  return mergeFieldLabelFor(name, words)
}
