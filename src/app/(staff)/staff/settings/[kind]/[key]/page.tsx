import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { VersionHistory } from '@/components/config/VersionHistory'
import { editorContext } from '@/features/config/editorContext'
import { KIND_LABELS } from '@/features/config/kindLabels'
import { isConfigKind } from '@/features/config/kinds'
import { getEditorState } from '@/features/config/settingsViews'
import { listReviewerChoices } from '@/features/reviews/reviewerView'
import { getTownSettings } from '@/features/town/settings'
import { requireStaffContext } from '@/server/requireStaff'
import { publishAction, rollbackAction, saveDraftAction } from '../../actions'

interface Props {
  params: Promise<{ kind: string; key: string }>
}

export default async function SettingsKeyPage({ params }: Props) {
  const { kind, key: rawKey } = await params
  const key = decodeURIComponent(rawKey)
  if (!isConfigKind(kind)) notFound()
  const ctx = await requireStaffContext()
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
