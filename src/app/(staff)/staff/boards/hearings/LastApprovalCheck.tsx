import { CheckField } from '@/components/staff/fields'

export const LAST_APPROVAL_LABEL = 'This is the last municipal approval the project needs'

export function LastApprovalCheck({ offered }: { offered: boolean }) {
  return offered ? <CheckField label={LAST_APPROVAL_LABEL} name="finalMunicipalApproval" /> : null
}
