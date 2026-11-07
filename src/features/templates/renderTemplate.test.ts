import { describe, expect, it } from 'vitest'
import { MERGE_FIELD_LABELS } from '@/features/templates/mergeFieldLabels'
import { MERGE_FIELDS, unknownMergeFields } from '@/features/templates/mergeFields'
import { renderTemplate, renderTemplateText } from '@/features/templates/renderTemplate'

describe('renderTemplate', () => {
  it('unknown merge field is reported', () => {
    const r = renderTemplate('Hello {{nope.field}} and {{town.name}}', {
      'town.name': 'Alder Pond',
    })
    expect(r).toEqual({ ok: false, error: { unknownFields: ['nope.field'] } })
  })

  it('merge value is HTML-escaped', () => {
    const r = renderTemplate('Owner: {{parcel.ownerName}}', {
      'parcel.ownerName': '<b>Pat & "Sam"</b>',
    })
    expect(r).toEqual({ ok: true, value: 'Owner: &lt;b&gt;Pat &amp; &quot;Sam&quot;&lt;/b&gt;' })
  })

  it('missing value renders Not recorded', () => {
    const r = renderTemplate('Issued {{application.issuedOn}} {{town.name}}', {
      'town.name': 'Alder Pond',
    })
    expect(r).toEqual({ ok: true, value: 'Issued Not recorded Alder Pond' })
  })

  it('tolerates spaces inside braces', () => {
    expect(renderTemplate('{{ town.name }}', { 'town.name': 'X' })).toEqual({
      ok: true,
      value: 'X',
    })
  })

  it('lists every merge field exactly as specified', () => {
    expect(MERGE_FIELDS).toEqual([
      'town.name',
      'application.number',
      'application.typeLabel',
      'application.issuedOn',
      'application.expiresOn',
      'parcel.displayId',
      'parcel.siteAddress',
      'parcel.ownerName',
      'project.title',
      'party.applicant.name',
      'party.contractor.name',
      'fees.totalFormatted',
      'conditions.list',
      'codeEdition.label',
      'board.name',
      'board.short_name',
      'board.chair.name',
      'meeting.date',
      'meeting.location',
      'meeting.time',
      'hearing.kind',
      'notice.recipientName',
      'notice.recipientAddress',
      'decision.outcome',
      'decision.votedOn',
      'decision.findings',
      'decision.conditions',
      'decision.reasons',
      'decision.conditionsSection',
      'decision.reasonsSection',
      'decision.appealRights',
      'town.address',
      'town.phone',
      'town.email',
      'town.website',
      'office.name',
      'signer.building_official.name',
      'signer.building_official.title',
      'signer.land_use_administrator.name',
      'signer.land_use_administrator.title',
      'signer.planning_board_chair.name',
      'signer.planning_board_chair.title',
      'signer.zba_chair.name',
      'signer.zba_chair.title',
      'signer.code_enforcement_officer.name',
      'signer.code_enforcement_officer.title',
      'signer.town_clerk.name',
      'signer.town_clerk.title',
      'permit.contractorWithLicense',
      'fees.status',
      'certificate.number',
      'certificate.issuedOn',
      'certificate.finalInspection',
      'certificate.use',
      'order.number',
      'order.property',
      'order.issuedOn',
      'order.authority',
      'order.correctiveAction',
      'order.correctiveDeadline',
      'order.issuerName',
      'order.issuerTitle',
      'rtk.number',
      'rtk.receivedOn',
      'rtk.description',
      'case.number',
      'case.property',
      'case.status',
      'case.openedOn',
      'case.referredOn',
      'receipt.number',
      'receipt.date',
      'receipt.payerName',
      'receipt.total',
      'receipt.footer',
      'packet.title',
    ])
  })

  it('gives every merge field a plain-language label', () => {
    expect(Object.keys(MERGE_FIELD_LABELS).sort()).toEqual([...MERGE_FIELDS].sort())
    expect(Object.values(MERGE_FIELD_LABELS).every((label) => label.trim() !== '')).toBe(true)
    expect(MERGE_FIELD_LABELS['party.applicant.name']).toBe('Applicant name')
    expect(MERGE_FIELD_LABELS['signer.zba_chair.title']).toBe(
      'Zoning Board of Adjustment chair title',
    )
  })

  it('unknownMergeFields scans without rendering', () => {
    expect(unknownMergeFields('{{town.name}} {{bad}} {{bad}}')).toEqual(['bad'])
  })
})

describe('renderTemplateText', () => {
  it('renderTemplateText does not escape an ampersand', () => {
    const r = renderTemplateText('Owner: {{parcel.ownerName}}', {
      'parcel.ownerName': 'Pat & "Sam" <Co>',
    })
    expect(r).toEqual({ ok: true, value: 'Owner: Pat & "Sam" <Co>' })
  })

  it('reports unknown fields like the html renderer', () => {
    expect(renderTemplateText('{{nope}}', {})).toEqual({
      ok: false,
      error: { unknownFields: ['nope'] },
    })
  })

  it('renders Not recorded for a missing value', () => {
    expect(renderTemplateText('Issued {{application.issuedOn}}', {})).toEqual({
      ok: true,
      value: 'Issued Not recorded',
    })
  })
})
