import { describe, expect, it } from 'vitest'
import { textToDoc } from '@/features/templates/doc/textToDoc'

describe('textToDoc', () => {
  it('makes one paragraph per blank-line block and turns tokens into merge fields', () => {
    expect(textToDoc('Hello {{town.name}}.\n\n  Permit {{application.number}}  ')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'mergeField', attrs: { name: 'town.name' } },
            { type: 'text', text: '.' },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Permit ' },
            { type: 'mergeField', attrs: { name: 'application.number' } },
          ],
        },
      ],
    })
  })

  it('keeps a single line break inside a paragraph as a hard break', () => {
    expect(textToDoc('Line one\nLine two').content[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Line one' },
        { type: 'hardBreak' },
        { type: 'text', text: 'Line two' },
      ],
    })
  })

  it('turns a paragraph holding only a required statutory field into a locked block', () => {
    const converted = textToDoc('Findings: {{decision.findings}}\n\n{{decision.appealRights}}', {
      lockedSources: ['decision.appealRights'],
    })
    expect(converted.content[1]).toEqual({
      type: 'lockedBlock',
      attrs: { source: 'decision.appealRights' },
    })
  })

  it('leaves a statutory field inside a sentence as a merge field', () => {
    const converted = textToDoc('Rights: {{decision.appealRights}}', {
      lockedSources: ['decision.appealRights'],
    })
    expect(converted.content[0]?.type).toBe('paragraph')
  })

  it('appends the kind suffix after the paragraphs', () => {
    const converted = textToDoc('Intro', { suffix: [{ type: 'conditionsList' }] })
    expect(converted.content.map((n) => n.type)).toEqual(['paragraph', 'conditionsList'])
  })

  it('gives an empty body one empty paragraph', () => {
    expect(textToDoc('  \n\n ')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })
})
