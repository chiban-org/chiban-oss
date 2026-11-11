import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { saveProcessorAccount } from '@/features/payments/processorAccounts'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { setupPayments } from '@/test/paymentFixtures'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const { default: CardPaymentsPage } = await import('./page')
const { default: SettingsKeyPage } = await import('../[kind]/[key]/page')

let handle: TestDb
let accountId: string

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  const admin = await staffActor(handle.db, 'admin')
  accountId = (await setupPayments(handle.db, admin)).accountId
  state.actor = admin
})
afterAll(async () => {
  await handle.drop()
})

describe('card payments page', () => {
  it('edits the fee and receipts with the shared draft, publish and history flow', async () => {
    const html = renderToStaticMarkup(await CardPaymentsPage())
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(text).toContain('Save draft')
    expect(text).toContain('Version history')
    expect(text).not.toContain('Publish payment settings')
    expect(html).not.toContain('href="/staff/settings/payment_settings"')
  })

  it('shows the webhook address of the active account with a sentence on where it goes', async () => {
    const html = renderToStaticMarkup(await CardPaymentsPage())
    expect(html).toContain(`/api/payments/webhooks/${accountId}`)
    expect(html).toContain('Copy address')
    expect(html.replace(/<[^>]+>/g, ' ').replaceAll('&#x27;', "'")).toContain(
      "Paste this address into the webhook settings in the processor's dashboard.",
    )
  })

  it('sends the separate payment settings editor back to the card payments page', async () => {
    const opened = SettingsKeyPage({
      params: Promise.resolve({ kind: 'payment_settings', key: 'default' }),
    })
    await expect(opened).rejects.toThrow('NEXT_REDIRECT:/staff/settings/payments')
  })

  it('says an account saved without a signing secret is not receiving updates', async () => {
    const saved = await saveProcessorAccount(
      handle.db,
      state.actor as Actor,
      {
        processor: 'stripe',
        mode: 'test',
        accountRef: 'acct_first_save',
        settings: {},
        credentials: { secretKey: 'sk_test_789' },
        webhookSecret: null,
      },
      new AbortController().signal,
    )
    if (!saved.ok) throw new Error(saved.error)
    const html = renderToStaticMarkup(await CardPaymentsPage())
    const text = html.replace(/<[^>]+>/g, ' ').replaceAll('&#x27;', "'")
    expect(html).toContain(`/api/payments/webhooks/${saved.value.accountId}`)
    expect(text).toContain(
      'Paste this address into the webhook settings at the processor, then come back and paste the signing secret it gives you.',
    )
    expect(text).toContain(
      'This account is not receiving payment updates until its webhook signing secret is saved.',
    )
  })
})
