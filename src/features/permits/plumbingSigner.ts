import { plumbingInspectorOwns } from '@/features/authz/classificationScope'
import { type DocumentFrame, signerFor } from '@/features/pdf/frame'
import type { SignerOverride } from '@/features/templates/doc/docToBlocks'
import { defaultSignerRole, signerRoleOverride } from '@/features/templates/kinds/defaultSigner'
import type { TemplateKind } from '@/features/templates/templateSchema'

export function plumbingSignerOverride(
  kind: TemplateKind,
  classification: string | undefined,
  frame: DocumentFrame,
): { signerOverride?: SignerOverride } {
  const to = signerRoleOverride(kind, { plumbingOwned: plumbingInspectorOwns(classification) })
  if (to === undefined || signerFor(frame, to) === null) return {}
  return { signerOverride: { from: defaultSignerRole(kind), to } }
}
