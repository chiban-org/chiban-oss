'use client'

import { rollbackAction } from '@/app/(staff)/staff/settings/actions'
import { ActionForm } from '@/components/ActionForm'
import type { ConfigKind } from '@/features/config/kinds'

function restoreImpact(pinned: boolean): string {
  return pinned
    ? 'New applications use it from now on. Open applications keep the version they started under.'
    : 'Chiban starts using it now.'
}

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
        body: `Version ${String(version)} goes live at once as a new version, replacing what is published now. ${restoreImpact(pinned)}`,
        confirmLabel: label,
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="key" value={configKey} />
      <input type="hidden" name="toVersion" value={version} />
    </ActionForm>
  )
}
