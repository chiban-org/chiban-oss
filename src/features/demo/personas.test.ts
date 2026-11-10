import { describe, expect, it } from 'vitest'
import { DEMO_PERSONAS, personaFor } from '@/features/demo/personas'
import { DEMO_USERS } from '@/features/demo/seedDemo'

describe('demo personas', () => {
  it('each one is a seeded demo user of the same kind', () => {
    for (const persona of DEMO_PERSONAS) {
      const seeded = DEMO_USERS.find((u) => u.email === persona.email)
      expect(seeded?.kind, persona.email).toBe(persona.kind)
    }
  })

  it('covers the roles a visitor picks from', () => {
    expect(DEMO_PERSONAS.map((p) => p.role)).toEqual([
      'Clerk at the counter',
      'Building inspector',
      'Planning Board member',
      'Zoning Board member',
      'Applicant',
      'Contractor',
      'Administrator',
    ])
  })

  it('finds a persona only by its exact demo address', () => {
    expect(personaFor(' Admin@AlderPond.example ')?.role).toBe('Administrator')
    expect(personaFor('finance@alderpond.example')).toBeNull()
    expect(personaFor('admin@town.example')).toBeNull()
    expect(personaFor(null)).toBeNull()
  })
})
