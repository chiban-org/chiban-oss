import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { RestoreVersion } from '@/components/config/RestoreVersion'
import { VersionHistory } from '@/components/config/VersionHistory'
import { WorkflowEditor } from '@/components/config/WorkflowEditor'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
import { hasCapability } from '@/features/authz/capabilities'
import { discardOffer } from '@/features/config/discardOffer'
import { getEditorState } from '@/features/config/settingsViews'
import { getTownSettings } from '@/features/town/settings'
import { requireStaffContext } from '@/server/requireStaff'
import {
  discardDraftAction,
  previewWorkflowAction,
  publishAction,
  rollbackAction,
  saveDraftAction,
} from '../../actions'

export const metadata: Metadata = { title: 'Workflow' }

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ key: string }>
}

export default async function WorkflowPage({ params }: Props) {
  const { key: rawKey } = await params
  const key = decodeURIComponent(rawKey)
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal))) {
    return <NoPermission title="Workflow" action="change workflows" />
  }
  const state = await getEditorState(ctx.db, 'application_type', key, ctx.signal)
  if (state.versions.length === 0) notFound()
  const parsed = ApplicationTypeBodySchema.safeParse(state.body)
  if (!parsed.success) notFound()
  const classification = NH_CLASSIFICATIONS.find((c) => c.key === parsed.data.classification)
  if (classification === undefined) notFound()
  const town = await getTownSettings(ctx.db, ctx.signal)
  const timeZone = town.ok ? town.value.timeZone : 'America/New_York'
  return (
    <main>
      <SettingsHeader
        title={`Workflow for ${parsed.data.label}`}
        lead="The steps an application of this type goes through, in order."
        versioned
        back={{
          href: `/staff/settings/application_type/${encodeURIComponent(key)}`,
          label: parsed.data.label,
        }}
      />
      <WorkflowEditor
        key={state.versions.map((v) => `${v.id}:${v.status}`).join(',')}
        typeKey={key}
        initialBody={parsed.data}
        classification={classification}
        saveAction={saveDraftAction}
        publishAction={publishAction}
        previewAction={previewWorkflowAction}
        {...discardOffer(state.versions, discardDraftAction)}
      />
      <h2>Version history</h2>
      <VersionHistory
        rows={state.versions}
        timeZone={timeZone}
        rollbackSlot={(row) => (
          <RestoreVersion
            kind="application_type"
            configKey={key}
            version={row.version}
            pinned={true}
          />
        )}
      />
    </main>
  )
}
