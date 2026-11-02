import { describe, expect, it } from 'vitest'
import { renderSnapshotPdf } from '@/features/snapshots/snapshotPdf'
import { findIsoDates, findRawKeys } from '@/test/leaks'
import { pdfText } from '@/test/pdfText'

const body = {
  applicationNumber: 'BP-2026-0001',
  applicationTypeKey: 'BP',
  configPins: {},
  form: { key: 'f', label: 'Permit form', fields: [] },
  values: {},
  facts: {},
  attachments: [],
  receivedDate: null,
  capturedAt: '2026-11-02T15:00:00.000Z',
  parties: [{ role: 'applicant', name: 'Pat Smith', email: null }],
  attestation: { statementSha256: 'abc123', attestedAt: '2026-11-03T02:30:00.000Z' },
} as unknown as Parameters<typeof renderSnapshotPdf>[0]

describe('renderSnapshotPdf', () => {
  it('writes the attestation date in the town zone and party roles as labels', async () => {
    const bytes = await renderSnapshotPdf(body, 'Test Town', 1, 'America/New_York')
    const text = await pdfText(bytes)
    expect(text).toContain('Attested on November 2, 2026.')
    expect(findIsoDates(text)).toEqual([])
    expect(findRawKeys(text, ['applicant'])).toEqual([])
    expect(text).toContain('Applicant')
  })
})
