import { activePack } from '@/features/packs/registry'
import { packVocabulary, type Vocabulary } from '@/features/packs/vocabulary'
import { lockedTexts } from '@/features/templates/doc/lockedTexts'
import { signerRoleLabels } from '@/features/town/signerRoleLabels'

export interface PackText {
  signerRoleLabels: Readonly<Record<string, string>>
  lockedTexts: Readonly<Record<string, string>>
  environmentalAgency: string
  receiptNotices: boolean
  vocabulary: Vocabulary
}

export function packText(): PackText {
  return {
    signerRoleLabels: signerRoleLabels(),
    lockedTexts: lockedTexts(),
    environmentalAgency: activePack().labels.environmentalAgency,
    receiptNotices: activePack().manifest.rules.some(
      (r) => r.kind === 'notice_requirement' && r.stage === 'on_receipt',
    ),
    vocabulary: packVocabulary(),
  }
}

export {
  boardAbbrev,
  boardLabel,
  boardShort,
  governingBody,
  recordsLaw,
  recordsRequest,
} from '@/features/packs/vocabulary'
