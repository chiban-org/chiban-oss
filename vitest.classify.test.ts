import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { classifyTests } from './vitest.classify.ts'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const FORBIDDEN_IN_UNIT = /@\/test\/db|@testcontainers\//

describe('classifyTests', () => {
  const { unit } = classifyTests(ROOT)

  it('keeps every container-dependent file out of the unit lane', () => {
    const offenders = unit.filter((rel) =>
      FORBIDDEN_IN_UNIT.test(readFileSync(`${ROOT}${rel}`, 'utf8')),
    )
    expect(offenders).toEqual([])
  })

  it('classifies this file as a unit test', () => {
    expect(unit).toContain('vitest.classify.test.ts')
  })
})
