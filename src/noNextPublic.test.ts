import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '..')
const FORBIDDEN = ['NEXT', 'PUBLIC'].join('_').concat('_')
const SELF = path.join(ROOT, 'src', 'noNextPublic.test.ts')

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

function deployFiles(): string[] {
  const candidates = [
    'Dockerfile',
    'docker-compose.dev.yml',
    'deploy/docker-compose.yml',
    'deploy/.env.example',
    'deploy/Caddyfile',
    'deploy/deploy.sh',
  ]
  return candidates.map((c) => path.join(ROOT, c)).filter((f) => existsSync(f))
}

describe('no public build-time env', () => {
  it('appears in neither the Dockerfile, compose files, nor src', () => {
    const files = [...deployFiles(), ...walk(path.join(ROOT, 'src'))].filter((f) => f !== SELF)
    expect(files).toContain(path.join(ROOT, 'Dockerfile'))
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes(FORBIDDEN))
    expect(offenders).toEqual([])
  })
})
