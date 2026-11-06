import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SettingsEmpty } from '@/components/settings/SettingsEmpty'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { emptyKindCopy, KIND_DESCRIPTIONS, KIND_LABELS } from '@/features/config/kindLabels'
import { isConfigKind, isPinnedKind, isSingletonKind, SINGLETON_KEY } from '@/features/config/kinds'
import { choicesFromRows, namedKeyRows } from '@/features/config/referenceChoices'
import { loadReferenceRows } from '@/features/config/referenceRows'
import { readKeyListView } from '@/features/config/settingsTableView'
import { listKeysOfKind } from '@/features/config/settingsViews'
import type { RawSearchParams } from '@/features/dataTable/params'
import { recordStaffContext } from '@/server/requireStaff'
import { KeyTable } from './KeyTable'
import { NewConfigItem } from './StartDraft'

export const metadata: Metadata = { title: 'Settings' }

interface Props {
  params: Promise<{ kind: string }>
  searchParams: Promise<RawSearchParams>
}

export default async function SettingsKindPage({ params, searchParams }: Props) {
  const { kind } = await params
  const view = readKeyListView(await searchParams)
  if (!isConfigKind(kind)) notFound()
  if (isSingletonKind(kind)) redirect(`/staff/settings/${kind}/${SINGLETON_KEY}`)
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Settings" action="change settings" />
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal))) {
    return <NoPermission title="Settings" action="change settings" />
  }
  const [listed, referenceRows] = await Promise.all([
    listKeysOfKind(ctx.db, kind, ctx.signal),
    loadReferenceRows(ctx.db, ctx.signal),
  ])
  const all = namedKeyRows(listed, kind, choicesFromRows(referenceRows))
  const action = <NewConfigItem kind={kind} />
  const empty = all.length === 0
  return (
    <main>
      <SettingsHeader
        title={KIND_LABELS[kind]}
        lead={KIND_DESCRIPTIONS[kind]}
        versioned={isPinnedKind(kind)}
        action={empty ? undefined : action}
      />
      {empty ? (
        <SettingsEmpty {...emptyKindCopy(kind)} action={action} />
      ) : (
        <KeyTable kind={kind} all={all} view={view} />
      )}
    </main>
  )
}
