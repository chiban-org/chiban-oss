import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { VersionHistory } from '@/components/config/VersionHistory'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { editorContext } from '@/features/config/editorContext'
import { KIND_LABELS } from '@/features/config/kindLabels'
import { isConfigKind } from '@/features/config/kinds'
import { getEditorState } from '@/features/config/settingsViews'
import { listReviewerChoices } from '@/features/reviews/reviewerView'
import { getTownSettings } from '@/features/town/settings'
import { recordStaffContext } from '@/server/requireStaff'
import { publishAction, rollbackAction, saveDraftAction } from '../../actions'

interface Props {
  params: Promise<{ kind: string; key: string }>
}

export default async function SettingsKeyPage({ params }: Props) {
  const { kind, key: rawKey } = await params
  const key = decodeURIComponent(rawKey)
  if (!isConfigKind(kind)) notFound()
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Settings" action="change settings" />
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal))) {
    return <NoPermission title="Settings" action="change settings" />
  }
  const state = await getEditorState(ctx.db, kind, key, ctx.signal)
  const town = await getTownSettings(ctx.db, ctx.signal)
  const timeZone = town.ok ? town.value.timeZone : 'America/New_York'
  return (
    <main>
      <p>
        <Link href={`/staff/settings/${kind}`} className="text-action underline">
          {KIND_LABELS[kind]}
        </Link>
      </p>
      <h1>{key}</h1>
      {kind === 'application_type' ? (
        <p>
          <Link
            href={`/staff/settings/workflow/${encodeURIComponent(key)}`}
            className="text-action underline"
          >
            Edit the workflow steps
          </Link>
        </p>
      ) : null}
      <ConfigEditorForm
        kind={kind}
        configKey={key}
        initialBody={state.body}
        resetKey={state.versions.map((v) => `${v.id}:${v.status}`).join(',')}
        context={editorContext(await listReviewerChoices(ctx.db))}
        saveAction={saveDraftAction}
        publishAction={publishAction}
      />
      <h2>Version history</h2>
      <VersionHistory
        rows={state.versions}
        timeZone={timeZone}
        rollbackSlot={(row) => (
          <ActionForm action={rollbackAction} submitLabel={`Restore version ${row.version}`}>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="key" value={key} />
            <input type="hidden" name="toVersion" value={row.version} />
          </ActionForm>
        )}
      />
    </main>
  )
}
