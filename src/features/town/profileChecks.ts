import type { PublishError } from '@/features/config/publishChecks'
import type { TownProfileBody } from '@/features/town/profileSchema'
import { signerRoleLabels } from '@/features/town/signerRoleLabels'

export function checkTownProfile(body: TownProfileBody): PublishError | null {
  const seen = new Set<string>()
  for (const [index, signer] of body.signers.entries()) {
    if (seen.has(signer.role)) {
      return {
        invalid: [
          {
            path: `signers.${index}.role`,
            message: `${signerRoleLabels()[signer.role]} is listed twice.`,
          },
        ],
      }
    }
    seen.add(signer.role)
  }
  return null
}
