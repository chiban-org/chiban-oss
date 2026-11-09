import { describe, expect, it } from 'vitest'
import { portalDocumentTitle } from '@/features/portal/documentTitle'

describe('portalDocumentTitle', () => {
  it('names the submitted copy of the application in plain words', () => {
    expect(
      portalDocumentTitle({
        docKind: 'application_snapshot',
        title: 'Application BP-2026-0011, snapshot 1',
      }),
    ).toBe('Your application as submitted')
    expect(
      portalDocumentTitle({
        docKind: 'application_snapshot',
        title: 'Application BP-2026-0011, snapshot 3',
      }),
    ).toBe('Your application as submitted (version 3)')
  })

  it('leaves every other title alone', () => {
    expect(portalDocumentTitle({ docKind: 'permit', title: 'Building permit' })).toBe(
      'Building permit',
    )
  })
})
