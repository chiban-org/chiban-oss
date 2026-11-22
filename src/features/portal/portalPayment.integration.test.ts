import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Actor, loadActor } from '@/features/auth/actor'
import { claimProject, sendContractorClaim } from '@/features/contractors/claims'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { recordReturnedCheck, refundEntry } from '@/features/ledger/reversals'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { getPortalApplicationView } from '@/features/portal/portalView'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { lineAllocation, submittedTrade } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { setupPayments } from '@/test/paymentFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
})

describe('paying from the portal', () => {
  beforeEach(async () => {
    world = await setupPermitWorld(handle.db, { starters: ['nh.starter.electrical'] })
  })

  it('canPay is true when a fee is due on a submitted trade permit, the viewer is a payer party, and a card processor is set up', async () => {
    await setupPayments(handle.db, world.admin, 'simulated')
    const trade = await submittedTrade(handle.db, world)
    const view = await getPortalApplicationView(
      handle.db,
      world.applicant,
      trade.applicationId,
      signal,
    )
    if (!view.ok) throw new Error('view')
    expect(view.value.fees.dueCents).toBeGreaterThan(0)
    expect(view.value.canPay).toBe(true)
    expect(view.value.payAtOffice).toBe(false)
    expect(view.value.canEdit).toBe(false)
    expect(view.value.canUpload).toBe(true)
  })

  it('with no card processor, offers no online payment and says to pay at the office', async () => {
    const trade = await submittedTrade(handle.db, world)
    const view = await getPortalApplicationView(
      handle.db,
      world.applicant,
      trade.applicationId,
      signal,
    )
    if (!view.ok) throw new Error('view')
    expect(view.value.fees.dueCents).toBeGreaterThan(0)
    expect(view.value.canPay).toBe(false)
    expect(view.value.payAtOffice).toBe(true)
  })

  it('a reviewer party-less viewer sees no payment control', async () => {
    await setupPayments(handle.db, world.admin, 'simulated')
    const trade = await submittedTrade(handle.db, world)
    const inspector = await staffActor(handle.db, 'inspector')
    const view = await getPortalApplicationView(handle.db, inspector, trade.applicationId, signal)
    if (!view.ok) throw new Error('view')
    expect(view.value.canPay).toBe(false)
    expect(view.value.payAtOffice).toBe(false)
    expect(view.value.canEdit).toBe(false)
  })

  it('contractor party sees status after claiming, can withdraw, and cannot edit a submitted application', async () => {
    await setupPayments(handle.db, world.admin, 'simulated')
    const trade = await submittedTrade(handle.db, world)
    const mail = createMemoryTransport()
    await sendContractorClaim(
      handle.db,
      mail,
      world.staff,
      { projectId: world.projectId, email: 'pat@alderpond.example', name: 'Pat' },
      signal,
    )
    const id = await makeUser(handle.db, { role: 'contractor', email: 'pat@alderpond.example' })
    const contractor = (await loadActor(handle.db, id, signal)) as Actor
    expect(
      await getPortalApplicationView(handle.db, contractor, trade.applicationId, signal),
    ).toEqual({ ok: false, error: 'not_found' })
    const token = /\/claim\/([A-Za-z0-9_-]+)/.exec(mail.sent[0]?.text ?? '')?.[1] ?? ''
    await claimProject(handle.db, contractor, token, signal)
    const view = await getPortalApplicationView(handle.db, contractor, trade.applicationId, signal)
    if (!view.ok) throw new Error('view')
    expect(view.value.state).toBe('submitted')
    expect(view.value.stateLabel).toBe('Submitted')
    expect(view.value.canPay).toBe(true)
    expect(view.value.payAtOffice).toBe(false)
    expect(view.value.record.mayEnd).toBe(true)
  })
})

describe('money history on the portal', () => {
  beforeEach(async () => {
    world = await setupPermitWorld(handle.db, { starters: ['nh.starter.electrical'] })
  })

  async function payByCheck(trade: Awaited<ReturnType<typeof submittedTrade>>) {
    const paid = await recordCounterPayment(
      handle.db,
      world.staff,
      {
        method: 'check',
        amountCents: 4500,
        checkNumber: '1048',
        payerName: 'Demo electrician',
        allocations: [lineAllocation(trade, 4500)],
      },
      signal,
    )
    if (!paid.ok) throw new Error(paid.error)
    return paid.value
  }

  async function historyOf(applicationId: string) {
    const view = await getPortalApplicationView(handle.db, world.applicant, applicationId, signal)
    if (!view.ok) throw new Error('view')
    return view.value
  }

  it('a returned check shows next to the payment it reverses, so the balance due is explained', async () => {
    const trade = await submittedTrade(handle.db, world)
    const paid = await payByCheck(trade)
    const returned = await recordReturnedCheck(
      handle.db,
      await staffActor(handle.db, 'finance'),
      {
        entryId: paid.entryId,
        reason: 'Insufficient funds notice from the bank',
        returnedOn: '2027-03-05' as CivilDate,
      },
      signal,
    )
    if (!returned.ok) throw new Error(String(returned.error))
    const view = await historyOf(trade.applicationId)
    expect(view.fees.dueCents).toBe(4500)
    expect(view.history.map((h) => [h.entryType, h.amountCents, h.checkNumber])).toEqual([
      ['returned_check', -4500, '1048'],
      ['payment', 4500, '1048'],
    ])
    expect(view.history[1]?.receiptNumber).toBe(paid.receiptNumber)
  })

  it('a refund shows with its own receipt, so the paid amount matches the receipts', async () => {
    const trade = await submittedTrade(handle.db, world)
    const paid = await payByCheck(trade)
    const refunded = await refundEntry(
      handle.db,
      await staffActor(handle.db, 'finance'),
      {
        entryId: paid.entryId,
        amountCents: 1000,
        reason: 'Fixture count reduced after inspection',
      },
      signal,
    )
    if (!refunded.ok) throw new Error(JSON.stringify(refunded.error))
    const view = await historyOf(trade.applicationId)
    expect(view.fees.lines[0]?.paidCents).toBe(3500)
    expect(view.history.map((h) => [h.entryType, h.amountCents])).toEqual([
      ['refund', -1000],
      ['payment', 4500],
    ])
    expect(view.history[0]?.receiptNumber).toBe(refunded.value.receiptNumber)
  })
})

describe('fee estimate on the portal', () => {
  beforeEach(async () => {
    world = await setupPermitWorld(handle.db)
  })

  it('an application under review shows the fee it will owe at approval, the same figure staff preview', async () => {
    const app = await makeApplication(handle.db, world, {
      state: 'under_review',
      values: { finished_sq_ft: 1000 },
    })
    const view = await getPortalApplicationView(
      handle.db,
      world.applicant,
      app.applicationId,
      signal,
    )
    if (!view.ok) throw new Error('view')
    expect(view.value.fees.lines).toEqual([])
    expect(view.value.feeEstimate).toEqual({ totalCents: 35000, due: 'at_approval' })
  })

  it('a denied application shows no estimate', async () => {
    const app = await makeApplication(handle.db, world, {
      state: 'denied',
      values: { finished_sq_ft: 1000 },
    })
    const view = await getPortalApplicationView(
      handle.db,
      world.applicant,
      app.applicationId,
      signal,
    )
    if (!view.ok) throw new Error('view')
    expect(view.value.feeEstimate).toBeNull()
  })
})
