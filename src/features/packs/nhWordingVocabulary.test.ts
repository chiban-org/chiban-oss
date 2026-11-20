import { describe, expect, it } from 'vitest'
import { DEFAULT_WORDING } from '@/features/notifications/wording/wordingDefaults'
import { MERGE_FIELD_LABELS } from '@/features/templates/mergeFieldLabels'

describe('New Hampshire wording through the pack', () => {
  it('notification wording and merge fields', () => {
    expect(DEFAULT_WORDING.rtk_request_received.subject).toBe(
      'Right-to-Know request {{request.number}} received',
    )
    expect(DEFAULT_WORDING.rtk_request_received.body).toBe(
      'The town received your Right-to-Know request on {{request.receivedOn}}. Its number is {{request.number}}.\n\nThe town will answer by {{request.due}}. It will make the records available, deny the request in writing, or tell you in writing when it will answer.\n\nKeep the request number if you need to ask about it.',
    )
    expect(DEFAULT_WORDING.rtk_letter_sent.subject).toBe(
      'Letter about Right-to-Know request {{request.number}}',
    )
    expect(DEFAULT_WORDING.rtk_letter_sent.body).toBe(
      "The town's letter about your Right-to-Know request {{request.number}} is attached.",
    )
    expect(DEFAULT_WORDING.rtk_records_link.body).toBe(
      'The town released records for your Right-to-Know request {{request.number}} on {{records.releasedOn}}.{{records.linkNote}} The link works for {{link.days}} days.',
    )
    expect(DEFAULT_WORDING.rtk_records_attached.body).toBe(
      "The town released records for your Right-to-Know request {{request.number}} on {{records.releasedOn}}. The records and the town's letter are attached.",
    )
    expect(MERGE_FIELD_LABELS['signer.zba_chair.name']).toBe(
      'Zoning Board of Adjustment chair name',
    )
    expect(MERGE_FIELD_LABELS['signer.zba_chair.title']).toBe(
      'Zoning Board of Adjustment chair title',
    )
  })
})
