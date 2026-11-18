import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PackRolesSchema } from '@/features/packs/schema'

const ROOT = path.resolve(__dirname, '../../..')
const ROLES_SCHEMA = 'src/features/packs/schema/roles.ts'
const EXCLUDED_PREFIXES = ['src/test/', 'src/features/demo/', 'src/features/packs/probes/']
const TEST_FILE = /\.test\.tsx?$/

function engineFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) engineFiles(rel, acc)
    else if (/\.tsx?$/.test(entry.name)) acc.push(rel)
  }
  return acc
}

function engineSource(): string {
  return ['src', 'scripts']
    .flatMap((dir) => engineFiles(dir))
    .filter(
      (rel) =>
        rel !== ROLES_SCHEMA &&
        !TEST_FILE.test(rel) &&
        !EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix)),
    )
    .map((rel) => readFileSync(path.join(ROOT, rel), 'utf8'))
    .join('\n')
}

function declaredRoles(): { section: string; name: string }[] {
  return Object.entries(PackRolesSchema.shape).flatMap(([section, schema]) =>
    Object.keys(schema.shape).map((name) => ({ section, name })),
  )
}

function referenced(source: string, section: string, name: string): boolean {
  const qualified = new RegExp(`\\b${section}\\.${name}\\b`)
  const required = new RegExp(`requireRuleRole\\('${name}'\\)`)
  return qualified.test(source) || (section === 'rules' && required.test(source))
}

describe('pack role consumers', () => {
  it('declares roles in every section', () => {
    const sections = new Set(declaredRoles().map((r) => r.section))
    expect(sections).toEqual(
      new Set(['classifications', 'rules', 'recordSeries', 'ruleGroups', 'gates']),
    )
  })

  it('every declared role is read by engine code outside packs and tests', () => {
    const source = engineSource()
    const unused = declaredRoles()
      .filter(({ section, name }) => !referenced(source, section, name))
      .map(({ section, name }) => `${section}.${name}`)
    expect(unused, `roles no engine code reads: ${unused.join(', ')}`).toEqual([])
  })

  it('recognises a qualified read and a required rule read', () => {
    expect(referenced('packRoles().rules.zbaExercise', 'rules', 'zbaExercise')).toBe(true)
    expect(referenced("requireRuleRole('desProximity')", 'rules', 'desProximity')).toBe(true)
    expect(referenced('zbaExerciseLater', 'rules', 'zbaExercise')).toBe(false)
  })
})
