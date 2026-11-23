import { describe, expect, it } from 'vitest'
import type { Tx } from '@/db/client'
import { refuseBySilence } from '@/features/applications/deemedRefusal'
import { startClocksWhenPackUses } from '@/features/clocks/startClocks'
import { planDeliveries } from '@/features/decisions/delivery'
import { loadDeliveryGroups } from '@/features/decisions/deliveryView'
import { activePack } from '@/features/packs/registry'
import { markUnrecordedVoid } from '@/jobs/clocksDaily'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const today = '2027-06-01' as CivilDate
const unqueryable = new Proxy(
  {},
  {
    get() {
      throw new Error('the database was queried')
    },
  },
) as Tx

describe('legal features under the New Hampshire pack', () => {
  it('runs on the New Hampshire pack', () => {
    expect(activePack().manifest.id).toBe('nh')
  })

  it('refuses nothing by silence without a query', async () => {
    expect(await refuseBySilence(unqueryable, today, signal)).toEqual({
      refused: [],
      noticeOverdue: [],
      failures: [],
    })
  })

  it('voids no unrecorded variance without a query', async () => {
    expect(await markUnrecordedVoid(unqueryable, today, signal)).toEqual({ voided: [] })
  })

  it('plans and lists no decision deliveries without a query', async () => {
    await planDeliveries(unqueryable, { decisionId: 'any-decision' }, signal)
    await planDeliveries(unqueryable, { appealNodeId: 'any-node' }, signal)
    expect(await loadDeliveryGroups(unqueryable, 'any-application', signal)).toEqual([])
  })

  it('starts no clocks when a hearing is held, without a query', async () => {
    await startClocksWhenPackUses(unqueryable, 'any-application', 'hearing_held', today, signal)
  })
})
