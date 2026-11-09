import { describe, expect, it } from 'vitest'
import { errorCopy } from '@/server/actionRunner'
import {
  ID_FORMATS_SETTINGS_PATH,
  NO_ID_FORMATS_SENTENCE,
  unknownFormatSentence,
} from './idFormatCopy'

describe('parcel ID format copy', () => {
  it('points to the settings screen from every sentence', () => {
    expect(NO_ID_FORMATS_SENTENCE).toContain('Parcel ID formats')
    expect(unknownFormatSentence('cama15')).toContain('cama15')
    expect(unknownFormatSentence('cama15')).toContain(ID_FORMATS_SETTINGS_PATH)
  })

  it('replaces the bare unknown format error in forms', () => {
    expect(errorCopy('unknown_format')).toContain('Parcel ID formats')
  })
})
