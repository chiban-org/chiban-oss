import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(import.meta.dirname)

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, acc)
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) acc.push(full)
  }
  return acc
}

const CONTROL_WITH_REQUIRED =
  /<(?:Input|Textarea|NativeSelect|Select)\b[^<>]*?\brequired\b[^<>]*?\/?>/gs
const RAW_LABEL = /<Label\b/

function controlIds(source: string): string[] {
  const ids: string[] = []
  for (const match of source.matchAll(CONTROL_WITH_REQUIRED)) {
    const id = /\bid=(?:"([^"]+)"|\{([^}]+)\})/.exec(match[0])
    if (id !== null) ids.push(id[1] ?? id[2] ?? '')
  }
  return ids
}

function labelBlockFor(source: string, id: string): string {
  const literal = id.replace(/^`|`$/g, '')
  const at = source.search(
    new RegExp(
      `<Label[^>]*htmlFor=(?:"${literal}"|\\{${id.replace(/[$.*+?^{}()|[\]\\]/g, '\\$&')}\\})`,
    ),
  )
  if (at < 0) return ''
  const end = source.indexOf('</Label>', at)
  return source.slice(at, end)
}

describe('required marks on raw label forms (scan covers Input, Textarea, NativeSelect and Select with a literal id and a sibling Label in the same file)', () => {
  const files = sourceFiles(SRC).filter((f) => RAW_LABEL.test(readFileSync(f, 'utf8')))

  it('finds the raw label forms the scan is meant to protect', () => {
    const names = files.map((f) => path.relative(SRC, f).split(path.sep).join('/'))
    expect(names).toContain('components/inspections/RequestForm.tsx')
    expect(names).toContain('app/(anonymous)/report-anonymously/page.tsx')
  })

  it.each(
    files.map((f) => [path.relative(SRC, f).split(path.sep).join('/'), f]),
  )('%s renders the mark for every required control it labels itself', (_name, file) => {
    const source = readFileSync(file, 'utf8')
    for (const id of controlIds(source)) {
      const block = labelBlockFor(source, id)
      if (block === '') continue
      expect(block, `label for ${id}`).toContain('<RequiredMark')
    }
  })
})
