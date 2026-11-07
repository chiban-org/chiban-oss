import { rollbackAction } from '@/app/(staff)/staff/settings/actions'
import { ActionForm } from '@/components/ActionForm'
import { RestoreVersion } from '@/components/config/RestoreVersion'
import { TownSectionForm } from '@/components/config/town/TownSectionForm'
import { VersionHistory } from '@/components/config/VersionHistory'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { activeBoards } from '@/features/boards/townBoards'
import { getEditorState } from '@/features/config/settingsViews'
import { type TownProfileSection, townProfileForEditing } from '@/features/town/profileSettings'
import { getTownSettings } from '@/features/town/settings'
import type { StaffContext } from '@/server/requireStaff'

interface Props {
  ctx: StaffContext
  section: TownProfileSection
  title: string
  lead: string
}

export async function TownSettingsPage({ ctx, section, title, lead }: Props) {
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal))) {
    return <NoPermission title={title} action="change town settings" />
  }
  const [profile, town, history, boardRows] = await Promise.all([
    townProfileForEditing(ctx.db, ctx.signal),
    getTownSettings(ctx.db, ctx.signal),
    getEditorState(ctx.db, 'town_profile', 'default', ctx.signal),
    activeBoards(ctx.db),
  ])
  return (
    <main>
      <SettingsHeader title={title} lead={lead} />
      {profile.version !== null ? null : (
        <p className="mb-6 max-w-[75ch]">
          <span className="bg-highlight px-1">Nothing is in use yet.</span> Until it is, documents
          show only the town name at the top.
        </p>
      )}
      <TownSectionForm
        section={section}
        initial={profile.body}
        resetKey={String(profile.version)}
        townName={town.ok ? town.value.name : ''}
        boards={boardRows.map((b) => ({
          id: b.id,
          kind: b.kind,
          name: b.name,
          shortName: b.shortName,
        }))}
      />
      <details id="version-history" className="mt-8">
        <summary>Version history</summary>
        <VersionHistory
          rows={history.versions}
          timeZone={town.ok ? town.value.timeZone : 'America/New_York'}
          rollbackSlot={(row) => (
            <RestoreVersion
              kind="town_profile"
              configKey="default"
              version={row.version}
              pinned={false}
            />
          )}
        />
      </details>
    </main>
  )
}
