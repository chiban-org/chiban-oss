import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatLlmsTxt, type LlmsTxtInput } from './format'

const base: LlmsTxtInput = {
  siteUrl: 'https://docs.example.org',
  trailingSlash: true,
  title: 'Example',
  summary: 'Example is a test product.',
  details: ['Made by someone.'],
  sections: [
    { folders: ['', 'start'], label: 'Start here' },
    { folders: ['guides'], label: 'Guides' },
  ],
  links: [{ label: 'Home', href: 'https://example.org', note: 'the main site' }],
  docs: [
    { title: 'Second guide', description: 'B', permalink: '/guides/b/' },
    { title: 'Intro', description: 'What it is', permalink: '/' },
    { title: 'First guide', description: 'A', permalink: '/guides/a/' },
    { title: 'Hidden', description: 'H', permalink: '/guides/hidden/', unlisted: true },
    { title: 'Config', description: '', permalink: '/reference/config/' },
    { title: 'Demo', description: 'Try it', permalink: '/start/demo' },
  ],
}

describe('formatLlmsTxt', () => {
  const output = formatLlmsTxt(base)

  it('opens with the title and the summary as a blockquote', () => {
    assert.ok(output.startsWith('# Example\n\n> Example is a test product.\n\nMade by someone.\n'))
  })

  it('lists sections in the given order with pages sorted by path', () => {
    const start = output.indexOf('## Start here')
    const guides = output.indexOf('## Guides')
    assert.ok(start >= 0 && guides > start)
    assert.ok(output.indexOf('[First guide]') < output.indexOf('[Second guide]'))
    assert.ok(output.includes('- [Intro](https://docs.example.org/): What it is'))
  })

  it('groups several folders under one section', () => {
    assert.equal(output.match(/## Start here/g)?.length, 1)
    assert.ok(output.indexOf('[Demo]') < output.indexOf('## Guides'))
  })

  it('adds the trailing slash the site uses', () => {
    assert.ok(output.includes('- [Demo](https://docs.example.org/start/demo/): Try it'))
  })

  it('leaves out unlisted pages', () => {
    assert.ok(!output.includes('Hidden'))
  })

  it('keeps pages from folders without a configured section', () => {
    assert.ok(output.includes('## reference\n\n- [Config](https://docs.example.org/reference/config/)\n'))
  })

  it('ends with the outside links', () => {
    assert.ok(output.endsWith('## Elsewhere\n\n- [Home](https://example.org): the main site\n'))
  })
})
