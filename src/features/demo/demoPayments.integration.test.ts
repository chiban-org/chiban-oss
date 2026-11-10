import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { processorAccounts } from '@/db/schema'
import { demoStartupProblem, unsafeDemoProcessors } from '@/features/demo/demoStartup'
import { saveProcessorAccount } from '@/features/payments/processorAccounts'
import { createProcessor } from '@/features/payments/processors/registry'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  env.CHIBAN_DEMO_MODE = false
  await handle.drop()
})

const stripe = {
  processor: 'stripe' as const,
  mode: 'live' as const,
  accountRef: 'acct_alder',
  settings: {},
  credentials: { secretKey: 'sk_live_123' },
  webhookSecret: 'whsec_abc',
}

const simulated = {
  ...stripe,
  processor: 'simulated' as const,
  mode: 'test' as const,
  credentials: {},
}

describe('payment processors in demo mode', () => {
  it('saves a real processor only when demo mode is off', async () => {
    const admin = await staffActor(handle.db, 'admin')
    env.CHIBAN_DEMO_MODE = true
    expect(await saveProcessorAccount(handle.db, admin, stripe, signal)).toEqual({
      ok: false,
      error: 'demo_simulated_only',
    })
    expect(await handle.db.select().from(processorAccounts)).toEqual([])
    const sim = await saveProcessorAccount(handle.db, admin, simulated, signal, {
      simulatedEnabled: true,
    })
    expect(sim.ok).toBe(true)
    env.CHIBAN_DEMO_MODE = false
    expect((await saveProcessorAccount(handle.db, admin, stripe, signal)).ok).toBe(true)
  })

  it('names every configured processor that is not the simulator', async () => {
    const admin = await staffActor(handle.db, 'admin')
    expect(await unsafeDemoProcessors(handle.db, signal)).toEqual([])
    await saveProcessorAccount(handle.db, admin, simulated, signal, { simulatedEnabled: true })
    expect(await unsafeDemoProcessors(handle.db, signal)).toEqual([])
    await saveProcessorAccount(handle.db, admin, stripe, signal)
    await saveProcessorAccount(handle.db, admin, simulated, signal, { simulatedEnabled: true })
    expect(await unsafeDemoProcessors(handle.db, signal)).toEqual(['stripe live acct_alder'])
  })

  it('will not open a real processor while demo mode is on', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveProcessorAccount(handle.db, admin, stripe, signal)
    const [row] = await handle.db.select().from(processorAccounts)
    if (row === undefined) throw new Error('setup')
    const deps = { fetch, db: handle.db }
    expect(createProcessor(row, stripe.credentials, deps).processor).toBe('stripe')
    env.CHIBAN_DEMO_MODE = true
    expect(() => createProcessor(row, stripe.credentials, deps)).toThrow(/simulated processor/)
  })

  it('refuses to start a demo with a real processor and says why', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveProcessorAccount(handle.db, admin, stripe, signal)
    const lines: string[] = []
    const deps = { db: handle.db, signal, report: (line: string) => lines.push(line) }
    expect(await demoStartupProblem({ ...deps, demoMode: false })).toBeNull()
    expect(lines).toEqual([])
    const problem = await demoStartupProblem({ ...deps, demoMode: true })
    expect(problem).toContain('stripe live acct_alder')
    expect(lines).toEqual([problem])
  })

  it('starts a demo whose only processor is the simulator', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveProcessorAccount(handle.db, admin, simulated, signal, { simulatedEnabled: true })
    const deps = { db: handle.db, signal, report: () => undefined, demoMode: true }
    expect(await demoStartupProblem(deps)).toBeNull()
  })
})
