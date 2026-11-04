import { describe, expect, it } from 'vitest'
import {
  conditions,
  doc,
  fields,
  heading,
  locked,
  para,
  section,
  signature,
} from '@/features/templates/doc/build'
import type { DocNode } from '@/features/templates/doc/docSchema'
import { docToBlocks } from '@/features/templates/doc/docToBlocks'

const values = { 'town.name': 'Alder Pond', 'party.applicant.name': 'Zoë Ngũgĩ' }

const bold = (text: string): DocNode => ({ type: 'text', text, marks: [{ type: 'bold' }] })
const italic = (text: string): DocNode => ({ type: 'text', text, marks: [{ type: 'italic' }] })
const item = (...content: DocNode[]): DocNode => ({
  type: 'listItem',
  content: [{ type: 'paragraph', content }],
})

describe('docToBlocks', () => {
  it('renders a plain paragraph with merge values as a paragraph block', () => {
    expect(
      docToBlocks(doc(para('Dear {{party.applicant.name}}, from {{town.name}}.')), { values }),
    ).toEqual([{ kind: 'paragraph', text: 'Dear Zoë Ngũgĩ, from Alder Pond.' }])
  })

  it('renders bold and italic as rich runs', () => {
    const node: DocNode = {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'You must ' },
        bold('stop'),
        { type: 'text', text: ' now, ' },
        {
          type: 'mergeField',
          attrs: { name: 'party.applicant.name' },
          marks: [{ type: 'italic' }],
        },
      ],
    }
    expect(docToBlocks(doc(node), { values })).toEqual([
      {
        kind: 'text',
        runs: [
          { text: 'You must ' },
          { text: 'stop', bold: true },
          { text: ' now, ' },
          { text: 'Zoë Ngũgĩ', italic: true },
        ],
      },
    ])
  })

  it('renders bulleted and numbered lists, including a nested list', () => {
    const list: DocNode = {
      type: 'orderedList',
      attrs: { start: 1 },
      content: [
        item({ type: 'text', text: 'First' }),
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [italic('Second')] },
            { type: 'bulletList', content: [item({ type: 'text', text: 'Inner' })] },
          ],
        },
      ],
    }
    expect(docToBlocks(doc(list), { values })).toEqual([
      {
        kind: 'list',
        items: [
          { marker: '1.', depth: 0, runs: [{ text: 'First' }] },
          { marker: '2.', depth: 0, runs: [{ text: 'Second', italic: true }] },
          { marker: '•', depth: 1, runs: [{ text: 'Inner' }] },
        ],
      },
    ])
  })

  it('prints Not recorded for an empty merge field and drops omitted ones', () => {
    expect(
      docToBlocks(
        doc(para('Issued {{application.issuedOn}}'), para('{{decision.reasonsSection}}')),
        {
          values,
        },
      ),
    ).toEqual([{ kind: 'paragraph', text: 'Issued Not recorded' }])
  })

  it('splits a merged value with blank lines into paragraphs like a text template', () => {
    expect(
      docToBlocks(doc(para('Findings: {{decision.findings}}')), {
        values: { 'decision.findings': 'One.\n\nTwo.' },
      }),
    ).toEqual([
      { kind: 'paragraph', text: 'Findings: One.' },
      { kind: 'paragraph', text: 'Two.' },
    ])
  })

  it('fills field tables, conditions, sections, locked text and signatures', () => {
    const blocks = docToBlocks(
      doc(
        fields([['Applicant', 'party.applicant.name']]),
        heading('Conditions'),
        conditions(),
        section('order.facts'),
        locked('order.ceaseSentence'),
        signature('code_enforcement_officer'),
      ),
      {
        values,
        conditions: ['Keep the gate shut.'],
        sections: new Map([['order.facts', [{ kind: 'paragraph', text: 'A shed.' }]]]),
        locked: new Map([['order.ceaseSentence', 'Stop now.']]),
        people: new Map([['code_enforcement_officer', { name: 'Ann', title: 'Officer' }]]),
      },
    )
    expect(blocks).toEqual([
      { kind: 'fields', rows: [{ label: 'Applicant', value: 'Zoë Ngũgĩ' }] },
      { kind: 'heading', text: 'Conditions' },
      { kind: 'table', columns: ['Condition'], rows: [['Keep the gate shut.']] },
      { kind: 'paragraph', text: 'A shed.' },
      { kind: 'notice', text: 'Stop now.' },
      {
        kind: 'signature',
        role: 'code_enforcement_officer',
        label: 'Enforcement officer signature',
        person: { name: 'Ann', title: 'Officer' },
      },
    ])
  })

  it('leaves out a heading whose section is empty for this record', () => {
    expect(
      docToBlocks(doc(heading('Lien warning'), locked('order.lienWarning'), heading('Next')), {
        values,
      }),
    ).toEqual([{ kind: 'heading', text: 'Next' }])
  })
})
