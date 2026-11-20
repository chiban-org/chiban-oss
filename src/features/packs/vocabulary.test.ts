import { describe, expect, it } from 'vitest'
import { exactDetail } from '@/components/staff/search/searchOptions'
import { CAPABILITIES } from '@/constants/capabilities'
import { appealToBoard } from '@/features/appeals/appealWords'
import { certificationPhrase } from '@/features/boards/certificationWords'
import { restraintIssuer } from '@/features/enforcement/restraintWords'
import { defaultWordingFor } from '@/features/notifications/wording/wordingDefaults'
import { withPackForTest } from '@/features/packs/registry'
import {
  boardAbbrev,
  boardLabel,
  boardShort,
  governingBody,
  packVocabulary,
  recordsLaw,
  recordsRequest,
} from '@/features/packs/vocabulary'
import { mergeFieldLabel } from '@/features/templates/mergeFieldLabels'
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

  it('builds client-side words from a vocabulary value, not from the active pack', () => {
    const words = withPackForTest(XX_PACK, () => packVocabulary())
    expect(exactDetail('request', words)).toBe('Open Records request')
    expect(mergeFieldLabel('signer.zba_chair.name', words)).toBe('Vellmora zba body chair name')
    expect(defaultWordingFor(words).rtk_letter_sent.subject).toBe(
      'Letter about Open Records request {{request.number}}',
    )
    expect(mergeFieldLabel('signer.zba_chair.name', packVocabulary())).toBe(
      'Zoning Board of Adjustment chair name',
    )
  })
})
