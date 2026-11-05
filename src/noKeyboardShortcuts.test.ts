import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(import.meta.dirname)

const KEY_HANDLER_FILES = [
  'components/config/formBuilder/FormBuilder.tsx',
  'components/config/letterBuilder/LetterBuilder.tsx',
  'components/inspections/RequestQueue.tsx',
  'components/parcels/picker/ParcelCombobox.tsx',
  'components/staff/search/RecordSearch.tsx',
]

const GLOBAL_KEY_LISTENER =
  /(?:window|document)\s*\.\s*(?:addEventListener|removeEventListener)\(\s*['"`]key(?:down|up|press)['"`]/
const ELEMENT_KEY_PROP = /\bonKey(?:Down|Up|Press)\b/

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, acc)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(full)
  }
  return acc
}

const relative = (file: string) => path.relative(SRC, file).split(path.sep).join('/')

describe('no custom keyboard shortcuts', () => {
  it('no source file listens for key events on window or document', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      GLOBAL_KEY_LISTENER.test(readFileSync(f, 'utf8')),
    )
    expect(offenders.map(relative)).toEqual([])
  })

  it('element key handlers exist only in the listed files', () => {
    const found = sourceFiles(SRC)
      .filter((f) => ELEMENT_KEY_PROP.test(readFileSync(f, 'utf8')))
      .map(relative)
    expect(found.sort()).toEqual([...KEY_HANDLER_FILES].sort())
  })

  it('the shared key hint components are gone', () => {
    const names = sourceFiles(SRC).map(relative)
    expect(names).not.toContain('components/KeyHints.tsx')
    expect(names).not.toContain('components/ui/kbd.tsx')
  })
})
