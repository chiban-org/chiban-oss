import type { violationFindings } from '@/db/schema'
import type { FindingUses } from '@/features/enforcement/findingUses'
import { PROVISION_KIND_LABELS } from '@/features/enforcement/labels'

type Finding = Pick<
  typeof violationFindings.$inferSelect,
  'id' | 'status' | 'provisionKind' | 'provisionRef'
>

export function openFindingChoices(
  findings: readonly Finding[],
  uses: FindingUses,
): { id: string; label: string; note?: string }[] {
  return findings
    .filter((f) => f.status === 'open')
    .map((f) => {
      const used = uses.get(f.id) ?? []
      return {
        id: f.id,
        label: `${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef}`,
        ...(used.length === 0 ? {} : { note: `${used.join('. ')}.` }),
      }
    })
}
