import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export function correctionMark(revision: number, correctedOn: CivilDate | null): string | null {
  if (revision < 1 || correctedOn === null) return null
  return `Corrected, revision ${revision}, ${formatCivilDate(correctedOn)}`
}
