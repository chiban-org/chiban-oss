import { describe, expect, it } from 'vitest'
import type { PermitData } from '@/features/permits/permitData'
import { mergeContextOf } from '@/features/permits/permitData'
import { docToBlocks } from '@/features/templates/doc/docToBlocks'
import { signatureLabel } from '@/features/templates/doc/signatureLabels'
import { HEARING_NOTICE_KIND } from '@/features/templates/kinds/boardKinds'
import { defaultSignerRole } from '@/features/templates/kinds/defaultSigner'
import { allowedFields, defaultDoc, documentKind } from '@/features/templates/kinds/documentKinds'
import { fieldGroups } from '@/features/templates/kinds/fieldGroups'
import { APPLICATION_FIELDS, FRAME_FIELDS } from '@/features/templates/kinds/kindTypes'
import { RTK_RESPONSE_KIND } from '@/features/templates/kinds/officeKinds'
import { isMergeField, type MergeField } from '@/features/templates/mergeFields'
import { mergeFieldLabelsFor } from '@/features/templates/mergeFieldWords'
import { checkTemplate } from '@/features/templates/templateChecks'
import { TEMPLATE_KINDS } from '@/features/templates/templateSchema'
import { SIGNER_ROLES } from '@/features/town/profileSchema'
import { signerRoleLabels } from '@/features/town/signerRoleLabels'

const NEW_FIELDS = [
  'application.description',
  'hearing.kindPhrase',
  'notice.issuedOn',
  'rtk.letterDate',
  'rtk.requesterName',
  'signer.plumbing_inspector.name',
  'signer.plumbing_inspector.title',
  'incomplete.reason',
  'incomplete.sentOn',
] as const

const APPEAL = 'You may appeal this decision to the Fernhollow appeals board within 30 days.'

const VALUES = {
  'application.number': 'BP-2027-0004',
  'application.typeLabel': 'Building permit',
  'parcel.displayId': 'R07-031',
  'parcel.siteAddress': '14 Alder Pond Road',
  'decision.outcome': 'Denied',
  'decision.votedOn': 'March 3, 2027',
  'decision.reasonsSection': 'Reasons: the shed sits inside the side setback.',
  'incomplete.reason': 'A plot plan showing the setbacks.',
  'incomplete.sentOn': 'March 4, 2027',
}

function rendered(
  kind: 'permit_decision_letter' | 'incomplete_notice',
  values: Record<string, string> = VALUES,
): string {
  return JSON.stringify(
    docToBlocks(defaultDoc(kind), {
      values,
      locked: new Map([['decision.appealRights', APPEAL]]),
    }),
  )
}

describe('staff decision kinds', () => {
  it('registers both kinds', () => {
    expect(TEMPLATE_KINDS).toContain('permit_decision_letter')
    expect(TEMPLATE_KINDS).toContain('incomplete_notice')
    expect(documentKind('permit_decision_letter').label).toBe('Permit decision letter')
    expect(documentKind('permit_decision_letter').title).toBe('Decision on your application')
    expect(documentKind('incomplete_notice').label).toBe('Incomplete application notice')
    expect(documentKind('incomplete_notice').title).toBe('Your application is incomplete')
    expect(defaultSignerRole('permit_decision_letter')).toBe('building_official')
    expect(defaultSignerRole('incomplete_notice')).toBe('building_official')
  })

  it('renders the permit decision letter with its reasons and appeal rights', () => {
    const text = rendered('permit_decision_letter')
    for (const part of [
      'BP-2027-0004',
      'Building permit',
      'R07-031',
      '14 Alder Pond Road',
      'Denied',
      'March 3, 2027',
      'Reasons: the shed sits inside the side setback.',
      'How to appeal',
      APPEAL,
      'Authorized signature',
    ]) {
      expect(text).toContain(part)
    }
  })

  it('renders the incomplete notice with what is missing', () => {
    const text = rendered('incomplete_notice')
    for (const part of [
      'BP-2027-0004',
      'R07-031',
      'March 4, 2027',
      'What is missing',
      'A plot plan showing the setbacks.',
      'Send what is missing to the town office. The application is reviewed once it is complete.',
      'Authorized signature',
    ]) {
      expect(text).toContain(part)
    }
  })

  it('allows the new fields on their kinds', () => {
    const letter = allowedFields('permit_decision_letter')
    for (const f of [
      ...APPLICATION_FIELDS,
      'decision.outcome',
      'decision.votedOn',
      'decision.reasons',
      'decision.reasonsSection',
    ] as const) {
      expect(letter.has(f), f).toBe(true)
    }
    const incomplete = allowedFields('incomplete_notice')
    for (const f of [...APPLICATION_FIELDS, 'incomplete.reason', 'incomplete.sentOn'] as const) {
      expect(incomplete.has(f), f).toBe(true)
    }
    expect(APPLICATION_FIELDS).toContain('application.description')
    expect(FRAME_FIELDS).toContain('signer.plumbing_inspector.name')
    expect(FRAME_FIELDS).toContain('signer.plumbing_inspector.title')
    expect(HEARING_NOTICE_KIND.fields).toEqual(
      expect.arrayContaining(['hearing.kindPhrase', 'notice.issuedOn']),
    )
    expect(RTK_RESPONSE_KIND.fields).toEqual(
      expect.arrayContaining(['rtk.letterDate', 'rtk.requesterName']),
    )
  })

  it('knows every new merge field and gives it a plain label', () => {
    const labels = new Map(
      Object.entries(mergeFieldLabelsFor({ boardLabel: { zba: 'Appeals board' } as never })),
    )
    for (const f of NEW_FIELDS) {
      expect(isMergeField(f), f).toBe(true)
      expect(labels.get(f as MergeField), f).toMatch(/^[A-Z][a-z]/)
    }
  })

  it('adds the plumbing inspector signer', () => {
    expect(SIGNER_ROLES).toContain('plumbing_inspector')
    expect(signerRoleLabels().plumbing_inspector).toBe('Plumbing inspector')
    expect(signatureLabel('plumbing_inspector')).toBe('Plumbing inspector signature')
  })

  it('fills the application description from the form answers', () => {
    const data = (values: Record<string, string>) =>
      ({
        application: { values, number: 'BP-2027-0004', typeBody: { label: 'Shed' } },
        conditions: [],
      }) as unknown as PermitData
    const of = (values: Record<string, string>) =>
      mergeContextOf(data(values))['application.description']
    expect(of({ description: 'A 10 by 12 shed' })).toBe('A 10 by 12 shed')
    expect(of({ project_description: 'A new porch' })).toBe('A new porch')
    expect(of({ description: 'A shed', project_description: 'A porch' })).toBe('A shed')
    expect(of({})).toBe('')
  })

  it('groups the incomplete notice fields with the application', () => {
    const groups = fieldGroups('incomplete_notice', {
      boardLabel: { zba: 'Appeals board' } as never,
    })
    const application = groups.find((g) => g.title === 'Application')
    expect(application?.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(['incomplete.reason', 'incomplete.sentOn']),
    )
  })

  it('locks the appeal rights so a town copy cannot drop them', () => {
    expect(documentKind('permit_decision_letter').locked).toEqual(['decision.appealRights'])
    const base = {
      key: 'fernhollow-decision',
      label: 'Fernhollow decision letter',
      kind: 'permit_decision_letter' as const,
      format: 'doc' as const,
    }
    expect(checkTemplate({ ...base, doc: defaultDoc('permit_decision_letter') })).toBeNull()
    const dropped = {
      type: 'doc' as const,
      content: defaultDoc('permit_decision_letter').content.filter((n) => n.type !== 'lockedBlock'),
    }
    expect(checkTemplate({ ...base, doc: dropped })).toEqual({
      missingLockedBlocks: ['decision.appealRights'],
    })
  })

  it('prints an approval with no reasons paragraph', () => {
    const blocks = rendered('permit_decision_letter', {
      ...VALUES,
      'decision.outcome': 'Approved',
      'decision.reasonsSection': '',
    })
    expect(blocks).toContain('Approved')
    expect(blocks).toContain(APPEAL)
    expect(blocks).not.toContain('Not recorded')
    expect(blocks).not.toContain('"text":""')
  })
})
