import type { Db } from '@/db/client'
import { DEMO_REFUSAL } from '@/features/demo/demoMode'
import { makeUser } from '@/test/factories'
import type { Fields } from '@/test/testHarness/actions'
import { settle } from '@/test/testHarness/actions'

export interface LockedCase {
  name: string
  run: (form: FormData) => Promise<unknown>
  fields: (db: Db) => Promise<Fields>
  refused: unknown
}

const REFUSED = { ok: false, error: DEMO_REFUSAL }
const NONE = (): Promise<Fields> => Promise.resolve({})
const UUID = '00000000-0000-4000-8000-000000000001'

async function someone(db: Db): Promise<Fields> {
  return {
    userId: await makeUser(db, { role: 'inspector' }),
    reason: 'Left the town',
    roles: 'staff',
  }
}

function plain(
  name: string,
  action: (form: FormData) => Promise<unknown>,
  fields: LockedCase['fields'] = NONE,
): LockedCase {
  return { name, run: (form) => settle(action(form)), fields, refused: REFUSED }
}

function settingsBody(kind: string, extra: Fields = {}): () => Promise<Fields> {
  return () => Promise.resolve({ kind, key: 'default', body: '{}', toVersion: '1', ...extra })
}

export async function lockedActionCases(): Promise<LockedCase[]> {
  const account = await import('@/app/(staff)/staff/account/actions')
  const setPassword = await import('@/app/(auth)/staff/set-password/actions')
  const users = await import('@/app/(staff)/staff/admin/users/actions')
  const settings = await import('@/app/(staff)/staff/settings/actions')
  const town = await import('@/app/(staff)/staff/settings/town-profile/actions')
  const payments = await import('@/app/(staff)/staff/settings/payments/actions')
  const formats = await import('@/app/(staff)/staff/settings/parcel-id-formats/actions')
  const boards = await import('@/app/(staff)/staff/settings/boards/actions')
  const inspections = await import('@/app/(staff)/staff/inspections/actions')
  const exportActions = await import('@/app/(staff)/staff/admin/export/actions')
  const targets = await import('@/app/(staff)/staff/admin/export/targets/actions')
  const intake = await import('@/app/(staff)/staff/admin/anonymous-intake/actions')
  const gis = await import('@/app/(staff)/staff/gis/imports/actions')
  const lockedKinds = ['town_profile', 'payment_settings', 'notification_wording']
  return [
    plain('changing a password', account.changePasswordAction, () =>
      Promise.resolve({
        current: 'old-password-1234',
        password: 'new-password-5678',
        confirm: 'new-password-5678',
      }),
    ),
    plain('starting an authenticator', account.beginTotpAction),
    plain('confirming an authenticator', account.confirmTotpAction, () =>
      Promise.resolve({ code: '123456' }),
    ),
    plain('changing a display name', account.changeNameAction, () =>
      Promise.resolve({ displayName: 'Someone else' }),
    ),
    {
      name: 'setting a password from a link',
      run: (form) => settle(setPassword.setPasswordAction({ error: null }, form)),
      fields: () =>
        Promise.resolve({
          token: 'abc',
          password: 'new-password-5678',
          confirm: 'new-password-5678',
        }),
      refused: { error: DEMO_REFUSAL },
    },
    plain('inviting staff', users.inviteStaffAction, () =>
      Promise.resolve({
        displayName: 'New Hire',
        email: 'new.hire@alderpond.example',
        roles: 'staff',
      }),
    ),
    plain('resending an invite', users.resendInviteAction, someone),
    plain('revoking an invite', users.revokeInviteAction, someone),
    plain('changing roles', users.setRolesAction, someone),
    plain('disabling staff', users.disableAction, someone),
    plain('re-enabling staff', users.enableAction, someone),
    plain('clearing an authenticator', users.resetAuthenticatorAction, someone),
    plain('sending a password reset', users.sendResetAction, someone),
    ...lockedKinds.flatMap((kind) => [
      plain(`saving a ${kind} draft`, settings.saveDraftAction, settingsBody(kind)),
      plain(`publishing ${kind}`, settings.publishAction, settingsBody(kind)),
      plain(`discarding a ${kind} draft`, settings.discardDraftAction, settingsBody(kind)),
      plain(`rolling back ${kind}`, settings.rollbackAction, settingsBody(kind)),
      plain(
        `starting a ${kind} draft`,
        settings.startDraftAction,
        settingsBody(kind, { label: 'x' }),
      ),
    ]),
    plain('publishing a town profile section', town.publishTownSectionAction, () =>
      Promise.resolve({ section: 'identity', body: '{}' }),
    ),
    plain('uploading a town image', town.uploadTownImageAction, () =>
      Promise.resolve({
        file: new File([new Uint8Array([1, 2, 3])], 'seal.png', { type: 'image/png' }),
      }),
    ),
    plain('saving a payment processor', payments.saveProcessorAccountAction, () =>
      Promise.resolve({
        processor: 'stripe',
        mode: 'live',
        accountRef: 'acct_1',
        secretKey: 'sk_live_x',
        webhookSecret: 'whsec_x',
      }),
    ),
    plain('deleting a parcel ID format', formats.deleteFormatAction, () =>
      Promise.resolve({ key: 'gis12' }),
    ),
    plain('archiving a board', boards.archiveBoardAction, () => Promise.resolve({ boardId: UUID })),
    plain('connecting a Microsoft tenant', inspections.saveCalendarAccountAction, () =>
      Promise.resolve({
        tenantId: 'contoso.onmicrosoft.com',
        clientId: UUID,
        clientSecret: 'secret',
      }),
    ),
    plain(
      'pointing an inspector calendar elsewhere',
      inspections.saveInspectorCalendarAction,
      someone,
    ),
    plain('starting a full export', exportActions.requestExportAction),
    plain('saving an export target', targets.saveTargetAction, () =>
      Promise.resolve({ kind: 'local_folder', name: 'Copy', root: '/tmp' }),
    ),
    plain('turning an export target on', targets.setTargetActiveAction, () =>
      Promise.resolve({ id: UUID, active: 'true' }),
    ),
    plain('running an export target', targets.runTargetNowAction, () =>
      Promise.resolve({ id: UUID }),
    ),
    plain('turning anonymous intake on', intake.enableAnonymousIntakeAction),
    plain('turning anonymous intake off', intake.disableAnonymousIntakeAction),
    plain('pointing a GIS layer at another address', gis.updateLayerSettingsAction, () =>
      Promise.resolve({
        layer: 'parcels',
        adapter: 'esri_rest',
        sourceUrl: 'http://169.254.169.254/',
      }),
    ),
  ]
}
