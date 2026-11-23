import { ME_PACK } from '@packs/me'
import { describe, expect, it } from 'vitest'
import {
  appealPointer,
  appealsLead,
  recordDecisionDescription,
} from '@/features/appeals/appealWords'
import { withPackForTest } from '@/features/packs/registry'
import { XX_PACK } from '@/test/packs/xx'

describe('administrative officials wording', () => {
  it('names the Maine code enforcement officer', () => {
    withPackForTest(ME_PACK, () => {
      expect(appealsLead()).toBe(
        'Decisions by the code enforcement officer or another town official that can be appealed to the Board of Appeals.',
      )
      expect(
        appealPointer().startsWith(
          'To appeal a decision by the code enforcement officer to the Board of Appeals',
        ),
      ).toBe(true)
      expect(recordDecisionDescription()).toBe(
        'A decision by the code enforcement officer or another town official on an application or permit. Recording it starts the time to appeal it to the Board of Appeals.',
      )
    })
  })

  it('lists three officials with commas', () => {
    const pack = {
      ...XX_PACK,
      labels: {
        ...XX_PACK.labels,
        administrativeOfficials: ['permit warden', 'land keeper', 'road steward'] as const,
      },
    }
    withPackForTest(pack, () => {
      expect(appealsLead()).toContain(
        'by the permit warden, land keeper, road steward or another town official',
      )
      expect(appealPointer()).toContain('by the permit warden, land keeper or road steward to')
    })
  })
})
