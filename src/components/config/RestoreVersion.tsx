'use client'

import { rollbackAction } from '@/app/(staff)/staff/settings/actions'
import { ActionForm } from '@/components/ActionForm'
import { publishImpact } from '@/components/config/PublishBar'
import type { ConfigKind } from '@/features/config/kinds'

export function RestoreVersion({
  kind,
  configKey,
  version,
  pinned,
}: {
  kind: ConfigKind
  configKey: string
  version: number
  pinned: boolean
}) {
  const label = `Restore version ${String(version)}`
  return (
    <ActionForm
      action={rollbackAction}
      submitLabel={label}
      compact
      confirm={{
        title: `${label}?`,
        body: `Version ${String(version)} is published again as a new version, replacing what is published now. ${publishImpact(pinned)}`,
        confirmLabel: label,
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="key" value={configKey} />
      <input type="hidden" name="toVersion" value={version} />
    </ActionForm>
  )
}
