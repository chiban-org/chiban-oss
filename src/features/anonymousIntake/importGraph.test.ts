import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const FORBIDDEN = [
  'next/headers',
  'server/getActor',
  'server/actionGuard',
  'server/actionRunner',
  'server/trpc',
  'features/auth/',
  'features/sessions',
  'CsrfProvider',
  'components/providers',
  'constants/cookies',
]
const ENTRIES = [
  'src/app/(anonymous)/layout.tsx',
  'src/app/(anonymous)/report-anonymously/page.tsx',
  'src/app/(anonymous)/report-anonymously/received/page.tsx',
  'src/app/intake/anonymous/route.ts',
]

async function graphOf(entry: string): Promise<string[]> {
  const result = await build({
    entryPoints: [`${ROOT}${entry}`],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    tsconfig: `${ROOT}tsconfig.json`,
    loader: { '.css': 'empty' },
    jsx: 'automatic',
    logLevel: 'silent',
  })
  const inputs = Object.keys(result.metafile.inputs)
  const externals = Object.values(result.metafile.outputs).flatMap((o) =>
    o.imports.filter((i) => i.external).map((i) => i.path),
  )
  return [...inputs, ...externals]
}

describe('anonymous import graph', () => {
  it.each(
    ENTRIES,
  )('anonymous modules never import session, csrf, actor, trpc, or next/headers: %s', async (entry) => {
    const graph = await graphOf(entry)
    const offenders = graph.filter((path) => FORBIDDEN.some((bad) => path.includes(bad)))
    expect(offenders).toEqual([])
  })
})
