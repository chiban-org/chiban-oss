import { activePack } from '@/features/packs/registry'
import {
  acknowledgementEnabled,
  packVocabulary,
  type Vocabulary,
} from '@/features/packs/vocabulary'
import { lockedTexts } from '@/features/templates/doc/lockedTexts'
import type { SignerRole } from '@/features/town/profileSchema'
import { packSignerRoles, signerRoleLabels } from '@/features/town/signerRoleLabels'

export interface PackText {
  signerRoleLabels: Readonly<Record<string, string>>
  signerRoles: readonly SignerRole[]
  lockedTexts: Readonly<Record<string, string>>
  environmentalAgency: string
  receiptNotices: boolean
  significanceQuestion: boolean
  recordsAcknowledgement: boolean
  vocabulary: Vocabulary
}

export function packText(): PackText {
  return {
    signerRoleLabels: signerRoleLabels(),
    signerRoles: packSignerRoles(),
    lockedTexts: lockedTexts(),
    environmentalAgency: activePack().labels.environmentalAgency,
    receiptNotices: activePack().manifest.rules.some(
      (r) => r.kind === 'notice_requirement' && r.stage === 'on_receipt',
    ),
    significanceQuestion: activePack().manifest.classifications.some(
      (c) => c.significanceApplies === true,
    ),
    recordsAcknowledgement: acknowledgementEnabled(),
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
