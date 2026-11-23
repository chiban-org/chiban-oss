import { ME_PACK } from '@packs/me'
import { ME_STARTERS } from '@packs/me/starters'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadPack } from '@/features/packs/loadPack'
import { setActivePackForTest } from '@/features/packs/registry'
import { isDocTemplate } from '@/features/templates/templateSchema'

const BOARD_PREFIXES = ['VAR', 'AA', 'SUB', 'SPR']

function hearingNotice(prefix: string): string {
  const s = ME_STARTERS.find((x) => x.applicationType.prefix === prefix)
  const t = s?.templates.find((x) => x.kind === 'hearing_notice')
  if (t === undefined || isDocTemplate(t)) throw new Error(`no ${prefix} hearing notice`)
  return t.body
}

function hearingMailsAbutters(prefix: string): boolean {
  const s = ME_STARTERS.find((x) => x.applicationType.prefix === prefix)
  if (s === undefined) throw new Error(`no ${prefix} starter`)
  const classification = loadPack().classifications.find(
    (c) => c.key === s.applicationType.classification,
  )
  const bound = new Set(classification?.noticeRequirementKeys ?? [])
  return loadPack().rules.some(
    (r) =>
      r.kind === 'notice_requirement' &&
      r.stage !== 'on_receipt' &&
      bound.has(r.key) &&
      'roles' in r.recipients &&
      r.recipients.roles.includes('abutter_owner'),
  )
}

beforeAll(() => setActivePackForTest(ME_PACK))
afterAll(() => setActivePackForTest(null))

describe('who a Maine hearing notice says it is mailed to', () => {
  it.each(BOARD_PREFIXES)('%s names abutters only when its hearing rules mail them', (prefix) => {
    const text = hearingNotice(prefix)
    if (hearingMailsAbutters(prefix)) {
      expect(text).toContain('mailed to the owners of abutting property')
    } else {
      expect(text).not.toContain('abutting property')
      expect(text).toContain('This notice is mailed to the applicant')
    }
  })

  it('a subdivision hearing mails only the applicant', () => {
    expect(hearingMailsAbutters('SUB')).toBe(false)
  })
})
