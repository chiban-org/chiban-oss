import { ME_PACK } from '@packs/me'
import { afterEach, describe, expect, it } from 'vitest'
import { maineUsers } from '@/features/demo/me/maineTown'
import { demoPersonas, personaFor } from '@/features/demo/personas'
import { DEMO_USERS } from '@/features/demo/seedDemo'
import { setActivePackForTest } from '@/features/packs/registry'

describe('demo personas', () => {
  it('each one is a seeded demo user of the same kind', () => {
    for (const persona of demoPersonas()) {
      const seeded = DEMO_USERS.find((u) => u.email === persona.email)
      expect(seeded?.kind, persona.email).toBe(persona.kind)
    }
  })

  it('covers the roles a visitor picks from', () => {
    expect(demoPersonas().map((p) => p.role)).toEqual([
      'Clerk at the counter',
      'Building inspector',
      'Finance clerk',
      'Town records custodian',
      'Departmental reviewer',
      'Planning Board member',
      'Zoning Board member',
      'Applicant',
      'Contractor',
      'Administrator',
    ])
  })

  it('finds a persona only by its exact demo address', () => {
    expect(personaFor(' Admin@AlderPond.example ')?.role).toBe('Administrator')
    expect(personaFor('official@alderpond.example')).toBeNull()
    expect(personaFor('admin@town.example')).toBeNull()
    expect(personaFor(null)).toBeNull()
  })
})

describe('demo personas under the Maine pack', () => {
  afterEach(() => {
    setActivePackForTest(null)
  })

  it('names the Maine board and records law and offers the plumbing inspector', () => {
    setActivePackForTest(ME_PACK)
    const personas = demoPersonas()
    expect(personas.map((p) => p.role)).toEqual([
      'Clerk at the counter',
      'Building inspector',
      'Local plumbing inspector',
      'Finance clerk',
      'Town records custodian',
      'Departmental reviewer',
      'Planning Board member',
      'Board of Appeals member',
      'Applicant',
      'Contractor',
      'Administrator',
    ])
    expect(personas.find((p) => p.role === 'Town records custodian')?.summary).toBe(
      'Answers FOAA requests, redacts records and manages holds and retention.',
    )
    expect(personas.find((p) => p.role === 'Board of Appeals member')?.summary).toBe(
      'Reads the packet for the appeals and variances before the Board of Appeals.',
    )
    for (const persona of personas) {
      const seeded = maineUsers().find((u) => u.email === persona.email)
      expect(seeded?.kind, persona.email).toBe(persona.kind)
    }
    expect(personaFor('plumbing@alderpond.example')?.home).toBe('/staff')
  })

  it('does not offer the plumbing inspector under New Hampshire', () => {
    expect(personaFor('plumbing@alderpond.example')).toBeNull()
  })
})
