import { describe, expect, it } from 'vitest'
import { CAPABILITIES } from '@/constants/capabilities'
import { appealToBoard } from '@/features/appeals/appealWords'
import { certificationPhrase } from '@/features/boards/certificationWords'
import { restraintIssuer } from '@/features/enforcement/restraintWords'
import { withPackForTest } from '@/features/packs/registry'
import {
  boardAbbrev,
  boardLabel,
  boardShort,
  governingBody,
  recordsLaw,
  recordsRequest,
} from '@/features/packs/vocabulary'
import { XX_PACK } from '@/test/packs/xx'

describe('vocabulary under a fictional pack', () => {
  it('reads every word from the active pack', () => {
    withPackForTest(XX_PACK, () => {
      expect(recordsLaw()).toBe('Open Records')
      expect(recordsRequest()).toBe('Open Records request')
      expect(governingBody()).toBe('town council')
      expect(boardLabel('zba')).toBe('Vellmora zba body')
      expect(boardShort('zba')).toBe('zba board')
      expect(boardAbbrev('zba')).toBe('zba abbr')
    })
  })

  it('carries those words into engine copy', () => {
    withPackForTest(XX_PACK, () => {
      expect(CAPABILITIES['rtk.manage']).toBe(
        'Log Open Records requests, respond, withhold, and release records',
      )
      expect(appealToBoard()).toBe('Appeal to the zba board')
      expect(certificationPhrase('certified')).toBe('certified by the town council')
      expect(restraintIssuer('zba')).toBe('the zba abbr')
    })
  })
})
