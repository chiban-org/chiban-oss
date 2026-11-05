import { notFound, redirect } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { RestoreVersion } from '@/components/config/RestoreVersion'
import { VersionHistory } from '@/components/config/VersionHistory'
import { type SettingsBackLink, SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { type EditorContext, editorContext } from '@/features/config/editorContext'
import { KIND_DESCRIPTIONS, KIND_LABELS } from '@/features/config/kindLabels'
import {
  type ConfigKind,
  isConfigKind,
  isPinnedKind,
  isSingletonKind,
} from '@/features/config/kinds'
import {
  choicesFromRows,
  keyWords,
  numberQuestionsFor,
  REFERENCE_KINDS,
  type ReferenceChoices,
  type ReferenceKind,
} from '@/features/config/referenceChoices'
import { loadReferenceRows } from '@/features/config/referenceRows'
import { documentKindLabel, getEditorState, labelOfBody } from '@/features/config/settingsViews'
import { loadFormBuilderData } from '@/features/forms/formBuilderData'
import { loadTownProfile } from '@/features/pdf/documentFrame'
import { listReviewerChoices } from '@/features/reviews/reviewerView'
import { getTownSettings } from '@/features/town/settings'
import { recordStaffContext, type StaffContext } from '@/server/requireStaff'
import { publishAction, rollbackAction, saveDraftAction } from '../../actions'
import { templatePreviewAction, templateSamplesAction } from '../../templateActions'

interface Props {
  params: Promise<{ kind: string; key: string }>
}

const SINGLETON_HOMES: Partial<Record<ConfigKind, SettingsBackLink>> = {
  payment_settings: { href: '/staff/settings/payments', label: 'Card payments' },
  inspection_settings: { href: '/staff/settings/inspections', label: 'Inspection schedule' },
  town_profile: { href: '/staff/settings/town-profile', label: 'Town profile' },
}

function headerFor(kind: ConfigKind, title: string) {
  if (isSingletonKind(kind)) {
    return { title: KIND_LABELS[kind], lead: KIND_DESCRIPTIONS[kind], back: SINGLETON_HOMES[kind] }
  }
  return {
    title,
    lead: KIND_DESCRIPTIONS[kind],
    back: { href: `/staff/settings/${kind}`, label: KIND_LABELS[kind] },
  }
}

function itemTitle(
  kind: ConfigKind,
  key: string,
  body: unknown,
  references: ReferenceChoices,
): string {
  const listed = (REFERENCE_KINDS as readonly string[]).includes(kind)
    ? references[kind as ReferenceKind].find((c) => c.key === key)?.label
    : undefined
  const title = listed ?? labelOfBody(kind, body) ?? keyWords(key)
  const documentKind = documentKindLabel(kind, body)
  return documentKind === null ? title : `${title} (${documentKind})`
}

async function builderContextFor(
  ctx: StaffContext,
  kind: ConfigKind,
  key: string,
  options: { base: EditorContext; published: boolean; townName: string },
): Promise<EditorContext> {
  if (kind === 'form') {
    return { ...options.base, form: await loadFormBuilderData(ctx.db, key, ctx.signal) }
  }
  if (kind !== 'template') return options.base
  return {
    ...options.base,
    template: {
      kindLocked: options.published,
      townName: options.townName,
      profile: await loadTownProfile(ctx.db, ctx.signal),
      samplesAction: templateSamplesAction,
      previewAction: templatePreviewAction,
    },
  }
}

export default async function SettingsKeyPage({ params }: Props) {
  const { kind, key: rawKey } = await params
  const key = decodeURIComponent(rawKey)
  if (!isConfigKind(kind)) notFound()
  if (kind === 'town_profile') redirect('/staff/settings/town-profile')
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Settings" action="change settings" />
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal))) {
    return <NoPermission title="Settings" action="change settings" />
  }
  const state = await getEditorState(ctx.db, kind, key, ctx.signal)
  const town = await getTownSettings(ctx.db, ctx.signal)
  const timeZone = town.ok ? town.value.timeZone : 'America/New_York'
  const referenceRows = await loadReferenceRows(ctx.db, ctx.signal)
  const references = choicesFromRows(referenceRows)
  const context = {
    ...editorContext(await listReviewerChoices(ctx.db)),
    references,
    feeQuestions: kind === 'fee_schedule' ? numberQuestionsFor(referenceRows, key) : [],
  }
  const isForm = kind === 'form'
  const builderContext = await builderContextFor(ctx, kind, key, {
    base: context,
    published: state.versions.some((v) => v.status !== 'draft'),
    townName: town.ok ? town.value.name : '',
  })
  return (
    <main data-wide={isForm || kind === 'template' ? true : undefined}>
      <SettingsHeader
        {...headerFor(kind, itemTitle(kind, key, state.body, references))}
        versioned={isPinnedKind(kind)}
      />
      <ConfigEditorForm
        kind={kind}
        configKey={key}
        initialBody={state.body}
        resetKey={state.versions.map((v) => `${v.id}:${v.status}`).join(',')}
        context={builderContext}
        saveAction={saveDraftAction}
        publishAction={publishAction}
      />
      <h2 className="mt-10">Version history</h2>
      <VersionHistory
        rows={state.versions}
        timeZone={timeZone}
        rollbackSlot={(row) => (
          <RestoreVersion
            kind={kind}
            configKey={key}
            version={row.version}
            pinned={isPinnedKind(kind)}
          />
        )}
      />
    </main>
  )
}
