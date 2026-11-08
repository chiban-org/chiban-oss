import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ReportFieldsEditor } from '@/components/config/ReportFieldsEditor'
import { RestoreVersion } from '@/components/config/RestoreVersion'
import { VersionHistory } from '@/components/config/VersionHistory'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
import { hasCapability } from '@/features/authz/capabilities'
import { discardOffer } from '@/features/config/discardOffer'
import { getEditorState } from '@/features/config/settingsViews'
import { formFieldsFor } from '@/features/reports/reportFields'
import { getTownSettings } from '@/features/town/settings'
import { requireStaffContext } from '@/server/requireStaff'
import { discardDraftAction, publishAction, saveDraftAction } from '../../actions'

export const metadata: Metadata = { title: 'Report columns' }

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ key: string }>
}

export default async function ReportFieldsPage({ params }: Props) {
  const { key: rawKey } = await params
  const key = decodeURIComponent(rawKey)
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal))) {
    return <NoPermission title="Report columns" action="change report columns" />
  }
  const state = await getEditorState(ctx.db, 'application_type', key, ctx.signal)
  if (state.versions.length === 0) notFound()
  const parsed = ApplicationTypeBodySchema.safeParse(state.body)
  if (!parsed.success) notFound()
  const offered = await formFieldsFor(ctx.db, parsed.data.formKey, ctx.signal)
  const town = await getTownSettings(ctx.db, ctx.signal)
  const timeZone = town.ok ? town.value.timeZone : 'America/New_York'
  return (
    <main>
      <SettingsHeader
        title={`Report columns for ${parsed.data.label}`}
        lead="Answers from the application form to add up in the permit volume and processing time reports and their downloads. Permit volume adds up the applications received each month; processing time adds up the permits issued. Applications made on an older form without the question show a blank."
        versioned
        back={{
          href: `/staff/settings/application_type/${encodeURIComponent(key)}`,
          label: parsed.data.label,
        }}
      />
      <ReportFieldsEditor
        key={state.versions.map((v) => `${v.id}:${v.status}`).join(',')}
        typeKey={key}
        initialBody={parsed.data}
        offered={offered}
        saveAction={saveDraftAction}
        publishAction={publishAction}
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
