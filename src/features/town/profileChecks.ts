import type { PublishError } from '@/features/config/publishChecks'
import { SIGNER_ROLE_LABELS, type TownProfileBody } from '@/features/town/profileSchema'

export function checkTownProfile(body: TownProfileBody): PublishError | null {
  const seen = new Set<string>()
  for (const [index, signer] of body.signers.entries()) {
    if (seen.has(signer.role)) {
      return {
        invalid: [
          {
            path: `signers.${index}.role`,
            message: `${SIGNER_ROLE_LABELS[signer.role]} is listed twice.`,
          },
        ],
      }
    }
    seen.add(signer.role)
  }
  return null
}
