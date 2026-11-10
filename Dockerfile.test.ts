import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { envSchema } from '@/config/env'

const dockerfile = readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8')
const dockerignore = readFileSync(new URL('./.dockerignore', import.meta.url), 'utf8')

function stageBody(name: string): string {
  const parts = dockerfile.split(/^FROM /m).slice(1)
  const part = parts.find((p) => p.split('\n')[0]?.endsWith(` AS ${name}`))
  if (part === undefined) throw new Error(`stage ${name} missing`)
  return part
}

function placeholdersOf(stage: string): Map<string, string> {
  const run = stage
    .replaceAll('\\\n', ' ')
    .split('\n')
    .filter((l) => l.startsWith('RUN'))
    .join('\n')
  const out = new Map<string, string>()
  for (const m of run.matchAll(/\b([A-Z][A-Z0-9_]+)=('[^']*'|[^\s']+)/g)) {
    const [, key, raw] = m
    if (key !== undefined && raw !== undefined) out.set(key, raw.replace(/^'|'$/g, ''))
  }
  return out
}

function requiredKeys(): string[] {
  return Object.entries(envSchema.shape)
    .filter(([, schema]) => !schema.safeParse(undefined).success)
    .map(([key]) => key)
}

describe('Dockerfile', () => {
  it('declares the five stages in order', () => {
    const names = [...dockerfile.matchAll(/^FROM .* AS (\S+)$/gm)].map((m) => m[1])
    expect(names).toEqual(['deps', 'prod-deps', 'build', 'runtime', 'migrate-tools'])
  })

  it('pins every FROM by sha256 or builds on an earlier stage', () => {
    const froms = [...dockerfile.matchAll(/^FROM (\S+) AS (\S+)$/gm)]
    const seen = new Set<string>()
    for (const [, ref, name] of froms) {
      if (ref === undefined || name === undefined) continue
      const pinnedNode = /^node:22-bookworm-slim@sha256:[0-9a-f]{64}$/.test(ref)
      expect(pinnedNode || seen.has(ref), ref).toBe(true)
      seen.add(name)
    }
  })

  it('sets a placeholder for every required env key in the build stage', () => {
    const placeholders = placeholdersOf(stageBody('build'))
    const required = requiredKeys()
    expect(required.length).toBeGreaterThan(0)
    for (const key of required) expect(placeholders.has(key), key).toBe(true)
  })

  it('placeholders parse through envSchema', () => {
    const placeholders = placeholdersOf(stageBody('build'))
    const parsed = envSchema.safeParse({
      ...Object.fromEntries(placeholders),
      NODE_ENV: 'production',
    })
    expect(parsed.success).toBe(true)
  })

  it('runs the production build and the entrypoint bundle in the build stage', () => {
    const build = stageBody('build')
    expect(build).toContain('pnpm build')
    expect(build).toContain('pnpm build:entrypoints')
  })

  it('carries no town identity through build args', () => {
    expect(dockerfile).not.toMatch(/^ARG /m)
  })

  it('runtime stage runs as node and installs ghostscript and postgresql-client-16', () => {
    const runtime = stageBody('runtime')
    expect(runtime).toMatch(/^USER node$/m)
    expect(runtime).toContain('ghostscript')
    expect(runtime).toContain('postgresql-client-16')
    expect(runtime).toContain('apt.postgresql.org')
  })

  it('runtime defaults to next start', () => {
    expect(stageBody('runtime')).toMatch(/^CMD \["node_modules\/\.bin\/next", "start"\]$/m)
  })

  it('migrate-tools adds the OCR toolchain and drops back to node', () => {
    const tools = stageBody('migrate-tools')
    for (const pkg of ['ocrmypdf', 'tesseract-ocr', 'tesseract-ocr-eng']) {
      expect(tools).toContain(pkg)
    }
    expect(tools.trimEnd().split('\n').at(-1)).toBe('USER node')
  })

  it('runtime carries the PDF fonts at the path the renderer reads them from', () => {
    expect(stageBody('runtime')).toContain(
      'COPY --from=build --chown=node:node /app/src/features/pdf/fonts ./src/features/pdf/fonts',
    )
  })

  it('runtime carries every local module next.config.ts imports, so next start can load it', () => {
    const config = readFileSync(new URL('./next.config.ts', import.meta.url), 'utf8')
    const local = [...config.matchAll(/from '\.\/(src\/[^']+)'/g)].map((m) => m[1] ?? '')
    expect(local.length).toBeGreaterThan(0)
    for (const file of local) {
      expect(stageBody('runtime'), file).toContain(
        `COPY --from=build --chown=node:node /app/${file}.ts ./${file}.ts`,
      )
    }
  })

  it('the runtime stage does not install the OCR toolchain', () => {
    expect(stageBody('runtime')).not.toContain('ocrmypdf')
  })
})

describe('.dockerignore', () => {
  it.each([
    '.claude',
    '.worktrees',
    'node_modules',
    '.next',
    '.env',
    '.git',
  ])('excludes %s', (entry) => {
    expect(dockerignore.split('\n')).toContain(entry)
  })

  it('keeps tests out of the build context so next build type-checks only what ships', () => {
    const lines = dockerignore.split('\n')
    for (const entry of [
      '**/*.test.ts',
      '**/*.test.tsx',
      'e2e',
      'playwright.config.ts',
      'playwright.demo.config.ts',
    ]) {
      expect(lines, entry).toContain(entry)
    }
  })

  it('excludes env variants but keeps the example', () => {
    const lines = dockerignore.split('\n')
    expect(lines).toContain('.env.*')
    expect(lines).toContain('!.env.example')
  })
})
