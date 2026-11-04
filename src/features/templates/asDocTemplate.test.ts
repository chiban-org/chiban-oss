import { NH_STARTERS } from '@packs/nh/starters'
import { describe, expect, it } from 'vitest'
import { asDocTemplate } from '@/features/templates/asDocTemplate'
import { docToBlocks } from '@/features/templates/doc/docToBlocks'
import { templateBlocks } from '@/features/templates/templateBlocks'
import { checkTemplate } from '@/features/templates/templateChecks'

const VALUES = {
  'town.name': 'Alder Pond',
  'application.number': 'ZBA-2027-0001',
  'decision.findings': 'The lot is narrow.\n\nThe hardship is real.',
  'decision.conditionsSection': 'Conditions: Plant a hedge.',
  'decision.appealRights': 'Appeal within 30 days under RSA 677:4.',
}

const starterTemplates = NH_STARTERS.flatMap((s) => s.templates)

describe('asDocTemplate', () => {
  it.each(
    starterTemplates.map((t) => [t.key, t] as const),
  )('%s converts to a document that passes the publish checks', (_key, template) => {
    expect(checkTemplate(asDocTemplate(template))).toBeNull()
  })

  it.each(
    starterTemplates.map((t) => [t.key, t] as const),
  )('%s prints the same blocks after conversion', (_key, template) => {
    const context = {
      values: VALUES,
      conditions: ['Plant a hedge.'],
      locked: new Map([['decision.appealRights', VALUES['decision.appealRights']]]),
    }
    const before = templateBlocks(template.kind, template, context)
    if (!before.ok) throw new Error('starter did not render')
    expect(docToBlocks(asDocTemplate(template).doc, context)).toEqual(before.value)
  })

  it('keeps a document template as it is', () => {
    const converted = asDocTemplate(
      starterTemplates[0] ?? { key: 'k', label: 'L', kind: 'letter', body: 'x' },
    )
    expect(asDocTemplate(converted)).toBe(converted)
  })
})
