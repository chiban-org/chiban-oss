import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { processorAccounts } from '@/db/schema'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import {
  getActiveProcessor,
  listProcessorAccounts,
  saveProcessorAccount,
} from '@/features/payments/processorAccounts'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

const stripeInput = {
  processor: 'stripe' as const,
  mode: 'test' as const,
  accountRef: 'acct_alder',
  settings: {},
  credentials: { secretKey: 'sk_test_123' },
  webhookSecret: 'whsec_abc',
}

describe('processor accounts', () => {
  it('credentials are stored encrypted and never returned by the list query', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const saved = await saveProcessorAccount(handle.db, admin, stripeInput, signal)
    expect(saved.ok).toBe(true)
    const [raw] = await handle.db.select().from(processorAccounts)
    expect(raw?.credentialsEnc).not.toContain('sk_test_123')
    expect(raw?.webhookSecretEnc).not.toContain('whsec_abc')
    const listed = await listProcessorAccounts(handle.db, signal)
    expect(JSON.stringify(listed)).not.toContain('Enc')
    expect(JSON.stringify(listed)).not.toContain('sk_test_123')
    expect(listed).toMatchObject([
      { processor: 'stripe', accountRef: 'acct_alder', isActive: true },
    ])
  })

  it('getActiveProcessor decrypts the stored credentials', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveProcessorAccount(handle.db, admin, stripeInput, signal)
    const active = await getActiveProcessor(handle.db, signal)
    expect(active.state).toBe('known')
    expect(active.state === 'known' && active.value.credentials).toEqual({
      secretKey: 'sk_test_123',
    })
    expect(active.state === 'known' && active.value.webhookSecret).toBe('whsec_abc')
  })

  it('no active account is not_applicable', async () => {
    expect(await getActiveProcessor(handle.db, signal)).toEqual({ state: 'not_applicable' })
  })

  it('saving a new account deactivates the previous one', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveProcessorAccount(handle.db, admin, stripeInput, signal)
    await saveProcessorAccount(handle.db, admin, { ...stripeInput, accountRef: 'acct_two' }, signal)
    const listed = await listProcessorAccounts(handle.db, signal)
    expect(listed.filter((a) => a.isActive)).toHaveLength(1)
    expect(listed.find((a) => a.isActive)?.accountRef).toBe('acct_two')
  })

  it('saving the same merchant again keeps its account, so the webhook address stays the same', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const first = await saveProcessorAccount(handle.db, admin, stripeInput, signal)
    const again = await saveProcessorAccount(
      handle.db,
      admin,
      { ...stripeInput, credentials: { secretKey: 'sk_test_456' }, webhookSecret: 'whsec_new' },
      signal,
    )
    expect(first.ok && again.ok && again.value.accountId).toBe(first.ok && first.value.accountId)
    expect(await handle.db.select().from(processorAccounts)).toHaveLength(1)
    const active = await getActiveProcessor(handle.db, signal)
    expect(active.state === 'known' && active.value.credentials).toEqual({
      secretKey: 'sk_test_456',
    })
    expect(active.state === 'known' && active.value.webhookSecret).toBe('whsec_new')
  })

  it('switching back to an earlier merchant reactivates its account and its webhook address', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const first = await saveProcessorAccount(handle.db, admin, stripeInput, signal)
    await saveProcessorAccount(handle.db, admin, { ...stripeInput, accountRef: 'acct_two' }, signal)
    const back = await saveProcessorAccount(handle.db, admin, stripeInput, signal)
    expect(back.ok && back.value.accountId).toBe(first.ok && first.value.accountId)
    const listed = await listProcessorAccounts(handle.db, signal)
    expect(listed).toHaveLength(2)
    expect(listed.find((a) => a.isActive)?.accountRef).toBe('acct_alder')
  })

  it('a change of mode is a different account with its own webhook address', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const test = await saveProcessorAccount(handle.db, admin, stripeInput, signal)
    const live = await saveProcessorAccount(
      handle.db,
      admin,
      { ...stripeInput, mode: 'live' },
      signal,
    )
    expect(live.ok && live.value.accountId).not.toBe(test.ok && test.value.accountId)
  })

  it('a second active account is refused by the unique index', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveProcessorAccount(handle.db, admin, stripeInput, signal)
    await expectDbError(
      handle.db.insert(processorAccounts).values({
        processor: 'stripe',
        mode: 'test',
        accountRef: 'acct_dup',
        settings: {},
        credentialsEnc: 'x',
        webhookSecretEnc: 'y',
        isActive: true,
        createdBy: admin.userId,
      }),
      /processor_accounts_one_active/,
    )
  })

  it('a blob that cannot be decrypted is import_failed', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveProcessorAccount(handle.db, admin, stripeInput, signal)
    await handle.db.update(processorAccounts).set({ credentialsEnc: 'v1:gone:aaaa:bbbb:cccc' })
    const active = await getActiveProcessor(handle.db, signal)
    expect(active.state).toBe('import_failed')
  })

  it('simulated account is refused when the flag is off', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const input = {
      processor: 'simulated' as const,
      mode: 'test' as const,
      accountRef: 'sim_town',
      settings: {},
      credentials: {},
      webhookSecret: 'sim',
    }
    expect(
      await saveProcessorAccount(handle.db, admin, input, signal, { simulatedEnabled: false }),
    ).toEqual({ ok: false, error: 'simulated_disabled' })
    const allowed = await saveProcessorAccount(handle.db, admin, input, signal, {
      simulatedEnabled: true,
    })
    expect(allowed.ok).toBe(true)
  })

  it('staff saving an account is forbidden', async () => {
    const staff = await staffActor(handle.db, 'staff')
    expect(await saveProcessorAccount(handle.db, staff, stripeInput, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(
      await handle.db.select().from(processorAccounts).where(eq(processorAccounts.isActive, true)),
    ).toHaveLength(0)
  })
})

describe('payment settings', () => {
  it('no published settings means no convenience fee', async () => {
    const settings = await getPaymentSettings(handle.db, signal)
    expect(settings.convenienceFee).toEqual({ basisPoints: 0, fixedCents: 0, appliesTo: [] })
  })

  it('a published version is read back', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveAndPublish(handle.db, admin, 'payment_settings', 'default', {
      key: 'default',
      convenienceFee: {
        basisPoints: 300,
        fixedCents: 0,
        appliesTo: ['card_online', 'card_present'],
      },
      receiptFooter: 'Thank you.',
      checksPayableTo: 'Town of Alder Pond',
    })
    const settings = await getPaymentSettings(handle.db, signal)
    expect(settings.convenienceFee.basisPoints).toBe(300)
    expect(settings.checksPayableTo).toBe('Town of Alder Pond')
  })
})
