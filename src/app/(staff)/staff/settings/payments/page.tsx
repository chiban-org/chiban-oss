import type { Metadata } from 'next'
import {
  discardDraftAction,
  publishAction,
  saveDraftAction,
} from '@/app/(staff)/staff/settings/actions'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { RestoreVersion } from '@/components/config/RestoreVersion'
import { VersionHistory } from '@/components/config/VersionHistory'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { discardOffer } from '@/features/config/discardOffer'
import { editorContext } from '@/features/config/editorContext'
import { getEditorState } from '@/features/config/settingsViews'
import { loadProcessorSettings } from '@/features/payments/settingsView'
import { getTownSettings } from '@/features/town/settings'
import { recordStaffContext } from '@/server/requireStaff'
import { ProcessorSection } from './ProcessorSection'

export const metadata: Metadata = { title: 'Card payments' }

export const dynamic = 'force-dynamic'

export default async function PaymentSettingsPage() {
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Card payments" action="change settings" />
  const result = await loadProcessorSettings(ctx.db, ctx.actor, ctx.signal)
  if (!result.ok) return <NoPermission title="Card payments" action="change payment settings" />
  const [state, town] = await Promise.all([
    getEditorState(ctx.db, 'payment_settings', 'default', ctx.signal),
    getTownSettings(ctx.db, ctx.signal),
  ])
  return (
    <main>
      <SettingsHeader
        title="Card payments"
        lead="The card processor account, and the convenience fee and receipt wording for every payment."
      />
      <ProcessorSection {...result.value} />
      <section aria-labelledby="convenience-fee">
        <h2 id="convenience-fee">Convenience fee and receipts</h2>
        <p className="text-muted-foreground">
          The convenience fee is passed to the payer on card payments only. It is shown on its own
          line and is not town fee revenue.
        </p>
        <ConfigEditorForm
          kind="payment_settings"
          configKey="default"
          initialBody={state.body}
          resetKey={state.versions.map((v) => `${v.id}:${v.status}`).join(',')}
          context={editorContext()}
          saveAction={saveDraftAction}
          publishAction={publishAction}
          {...discardOffer(state.versions, discardDraftAction)}
        />
        <details id="version-history" className="mt-8">
          <summary>Version history</summary>
          <VersionHistory
            rows={state.versions}
            timeZone={town.ok ? town.value.timeZone : 'America/New_York'}
            rollbackSlot={(row) => (
              <RestoreVersion
                kind="payment_settings"
                configKey="default"
                version={row.version}
                pinned={false}
              />
            )}
          />
        </details>
      </section>
    </main>
  )
}
