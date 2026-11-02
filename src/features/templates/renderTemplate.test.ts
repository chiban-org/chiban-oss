import { describe, expect, it } from 'vitest'
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
    ])
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
