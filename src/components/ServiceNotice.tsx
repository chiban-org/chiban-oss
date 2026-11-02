import type { ServiceMode } from '@/features/town/serviceStatus'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export function ServiceNotice({
  mode,
  exportUntil,
}: {
  mode: ServiceMode
  exportUntil: CivilDate | null
}) {
  if (mode === 'active') return null
  const message =
    mode === 'closed' || exportUntil === null
      ? 'This service is closed.'
      : `This service is no longer active. Records can be exported from the admin page until ${formatCivilDate(exportUntil)}.`
  return (
    <p role="status" className="m-0 border-b bg-surface px-4 py-3 text-base">
      {message}
    </p>
  )
}
