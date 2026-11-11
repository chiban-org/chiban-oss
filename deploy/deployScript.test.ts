import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { envExampleValues, readDeployFile } from './composeText'

const script = readDeployFile('deploy.sh')
const OLD = `registry.example/chiban@sha256:${'a'.repeat(64)}`
const NEW = `registry.example/chiban@sha256:${'b'.repeat(64)}`

const STUB_DOCKER = `#!/bin/bash
echo "$*" >> "$STUB_CALLS"
if [[ "$*" == *deploy-poll* && "\${STUB_POLL:-ok}" != "ok" ]]; then
  exit 1
fi
if [[ "$*" == *psql* ]]; then
  [ -n "\${STUB_DB_HEAD:-}" ] || exit 1
  echo "\${STUB_DB_HEAD}"
fi
if [[ "$*" == *_journal.json* ]]; then
  [ -n "\${STUB_JOURNAL:-}" ] || exit 1
  printf '%s\\n' "\${STUB_JOURNAL}"
fi
exit 0
`

function journal(...whens: number[]): string {
  return JSON.stringify(
    { entries: whens.map((when, idx) => ({ idx, when, tag: `m${idx}` })) },
    null,
    2,
  )
}

interface Run {
  status: number
  stderr: string
  env: Map<string, string>
  calls: string[]
  releases: string[]
}

interface RunOptions {
  poll?: 'ok' | 'fail'
  initialEnv?: string
  dbHead?: string
  journal?: string
}

function lines(text: string): string[] {
  return text.split('\n').filter((line) => line !== '')
}

function runDeploy(args: string[], opts: RunOptions): Run {
  const dir = mkdtempSync(path.join(tmpdir(), 'chiban-deploy-'))
  const bin = path.join(dir, 'bin')
  const deployDir = path.join(dir, 'deploy')
  const calls = path.join(dir, 'calls.log')
  mkdirSync(bin)
  mkdirSync(deployDir)
  writeFileSync(path.join(bin, 'docker'), STUB_DOCKER, { mode: 0o755 })
  writeFileSync(path.join(deployDir, 'deploy.sh'), script)
  chmodSync(path.join(deployDir, 'deploy.sh'), 0o755)
  const initialEnv = opts.initialEnv ?? `APP_DOMAIN=x.example\nCHIBAN_IMAGE=${OLD}\n`
  writeFileSync(path.join(deployDir, '.env'), initialEnv)
  writeFileSync(calls, '')
  const result = spawnSync('bash', [path.join(deployDir, 'deploy.sh'), ...args], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      STUB_CALLS: calls,
      STUB_POLL: opts.poll ?? 'ok',
      STUB_DB_HEAD: opts.dbHead ?? '',
      STUB_JOURNAL: opts.journal ?? '',
    },
    encoding: 'utf8',
  })
  const read = (name: string): string => {
    try {
      return readFileSync(path.join(deployDir, name), 'utf8')
    } catch {
      return ''
    }
  }
  return {
    status: result.status ?? -1,
    stderr: result.stderr,
    env: envExampleValues(read('.env')),
    calls: lines(readFileSync(calls, 'utf8')),
    releases: lines(read('releases.log')),
  }
}

describe('deploy.sh text', () => {
  it('starts with strict shell options', () => {
    const head = script.split('\n')
    expect(head[0]).toBe('#!/usr/bin/env bash')
    expect(head[1]).toBe('set -euo pipefail')
  })

  it('runs the documented sequence', () => {
    expect(script).toContain('docker compose pull')
    expect(script).toContain('docker compose up -d migrate')
    expect(script).toContain('docker compose up -d app worker')
    expect(script).toContain('node dist/deploy-poll.mjs --url http://app:3000 --expect-image')
    expect(script).toContain('docker image prune -a -f --filter until=168h')
  })
})

describe('deploy.sh behaviour', () => {
  it('refuses an image without a digest', () => {
    const run = runDeploy(['--image', 'registry.example/chiban:latest'], {})
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain('@sha256:')
    expect(run.calls).toEqual([])
    expect(run.env.get('CHIBAN_IMAGE')).toBe(OLD)
  })

  it('refuses a call without --image', () => {
    const run = runDeploy([], {})
    expect(run.status).not.toBe(0)
    expect(run.calls).toEqual([])
  })

  it('records the previous image before switching', () => {
    const run = runDeploy(['--image', NEW], {})
    expect(run.status).toBe(0)
    expect(run.env.get('CHIBAN_IMAGE')).toBe(NEW)
    expect(run.env.get('CHIBAN_IMAGE_PREVIOUS')).toBe(OLD)
    expect(run.releases).toHaveLength(1)
    const [stamp, ...fields] = (run.releases[0] ?? '').split(' ')
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    expect(fields).toEqual([`image=${NEW}`, `previous=${OLD}`])
  })

  it('runs pull, migrate, app and worker, poll, then prune in order on success', () => {
    const run = runDeploy(['--image', NEW], {})
    const order = ['pull', 'up -d migrate', 'up -d app worker', 'deploy-poll', 'image prune']
    const positions = order.map((needle) => run.calls.findIndex((c) => c.includes(needle)))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(run.calls.some((c) => c.includes(`--expect-image ${NEW}`))).toBe(true)
    expect(run.calls.at(-1)).toBe('image prune -a -f --filter until=168h')
  })

  it('rolls back and exits 1 when the poll fails', () => {
    const run = runDeploy(['--image', NEW], { poll: 'fail' })
    expect(run.status).toBe(1)
    expect(run.env.get('CHIBAN_IMAGE')).toBe(OLD)
    expect(run.calls.filter((c) => c.includes('up -d app worker'))).toHaveLength(2)
    expect(run.calls.some((c) => c.includes('image prune'))).toBe(false)
    expect(run.releases).toHaveLength(2)
    expect(run.releases[1]).toContain('rolled_back')
    expect(run.releases[1]).toContain(`image=${OLD}`)
  })

  it('exits 1 without a rollback target on a first deploy that fails', () => {
    const run = runDeploy(['--image', NEW], { poll: 'fail', initialEnv: 'APP_DOMAIN=x.example\n' })
    expect(run.status).toBe(1)
    expect(run.calls.filter((c) => c.includes('up -d app worker'))).toHaveLength(1)
    expect(run.releases.at(-1)).toContain('failed_no_previous')
  })
})

describe('deploy.sh rollback and the database', () => {
  it('never looks at migrations when the rollout succeeds', () => {
    const run = runDeploy(['--image', NEW], { dbHead: '200', journal: journal(100) })
    expect(run.status).toBe(0)
    expect(run.calls.some((c) => c.includes('psql') || c.includes('_journal.json'))).toBe(false)
  })

  it('compares the database with the journal inside the image it would roll back to', () => {
    const run = runDeploy(['--image', NEW], {
      poll: 'fail',
      dbHead: '100',
      journal: journal(50, 100),
    })
    expect(run.calls).toContain(`run --rm --entrypoint cat ${OLD} /app/drizzle/meta/_journal.json`)
    expect(run.calls.some((c) => c.startsWith('compose exec -T postgres psql'))).toBe(true)
  })

  it('refuses to roll back when the database has migrations the previous image does not know', () => {
    const run = runDeploy(['--image', NEW], {
      poll: 'fail',
      dbHead: '200',
      journal: journal(50, 100),
    })
    expect(run.status).toBe(1)
    expect(run.env.get('CHIBAN_IMAGE')).toBe(NEW)
    expect(run.calls.filter((c) => c.includes('up -d app worker'))).toHaveLength(1)
    expect(run.releases.at(-1)).toContain('rollback_refused')
    expect(run.releases.at(-1)).toContain(`image=${OLD}`)
    expect(run.stderr).toContain('Not rolling back')
    expect(run.stderr).toContain('restore the backup')
  })

  it('says plainly that only the image rolls back when the schemas match', () => {
    const run = runDeploy(['--image', NEW], {
      poll: 'fail',
      dbHead: '100',
      journal: journal(50, 100),
    })
    expect(run.status).toBe(1)
    expect(run.env.get('CHIBAN_IMAGE')).toBe(OLD)
    expect(run.releases.at(-1)).toContain('rolled_back')
    expect(run.stderr).toContain('Rolling back the application image only')
    expect(run.stderr).toContain('The database is not rolled back')
  })

  it('rolls back with a warning and restore steps when the migrations cannot be checked', () => {
    const run = runDeploy(['--image', NEW], { poll: 'fail' })
    expect(run.status).toBe(1)
    expect(run.env.get('CHIBAN_IMAGE')).toBe(OLD)
    expect(run.releases.at(-1)).toContain('rolled_back')
    expect(run.stderr).toContain('The database is not rolled back')
    expect(run.stderr).toContain('could not check')
    expect(run.stderr).toContain('restore the backup')
  })

  it('treats an unreadable answer as unknown rather than as a match', () => {
    const run = runDeploy(['--image', NEW], { poll: 'fail', dbHead: 'ERROR', journal: 'x' })
    expect(run.env.get('CHIBAN_IMAGE')).toBe(OLD)
    expect(run.stderr).toContain('could not check')
  })
})
