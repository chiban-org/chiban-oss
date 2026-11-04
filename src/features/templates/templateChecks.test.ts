import { describe, expect, it } from 'vitest'
import { doc, para } from '@/features/templates/doc/build'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import { checkTemplate } from '@/features/templates/templateChecks'
import { TEMPLATE_KINDS, type TemplateBody } from '@/features/templates/templateSchema'

const docTemplate = (
  kind: TemplateBody['kind'],
  content: ReturnType<typeof doc>,
): TemplateBody => ({
  key: 'k',
  label: 'Letter',
  kind,
  format: 'doc',
  doc: content,
})

describe('checkTemplate', () => {
  it.each(TEMPLATE_KINDS)('the default %s template passes', (kind) => {
    expect(checkTemplate(docTemplate(kind, documentKind(kind).defaultDoc))).toBeNull()
  })

  it('refuses a merge field the kind does not allow', () => {
    expect(checkTemplate(docTemplate('receipt', doc(para('Hi {{party.applicant.name}}'))))).toEqual(
      {
        disallowedMergeFields: ['party.applicant.name'],
      },
    )
  })

  it('refuses an unknown merge field', () => {
    expect(checkTemplate(docTemplate('letter', doc(para('Hi {{nope.field}}'))))).toEqual({
      unknownMergeFields: ['nope.field'],
    })
  })

  it('refuses a decision letter that drops the appeal rights block', () => {
    expect(
      checkTemplate(docTemplate('decision_letter', doc(para('Dear {{party.applicant.name}}')))),
    ).toEqual({
      missingLockedBlocks: ['decision.appealRights'],
    })
  })

  it('refuses an order block in a letter', () => {
    const body = docTemplate(
      'letter',
      doc({ type: 'recordSection', attrs: { name: 'order.facts' } }),
    )
    expect(checkTemplate(body)).toEqual({ unknownBlocks: ['order.facts'] })
  })

  it('accepts a text decision letter that carries the appeal rights token', () => {
    expect(
      checkTemplate({
        key: 'k',
        label: 'Letter',
        kind: 'decision_letter',
        body: 'Dear {{party.applicant.name}}\n\n{{decision.appealRights}}',
      }),
    ).toBeNull()
  })
})
