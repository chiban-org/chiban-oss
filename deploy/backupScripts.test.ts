import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { envExampleValues, readDeployFile } from './composeText'

const backup = readDeployFile('backup.sh')
const verify = readDeployFile('restore-verify.sh')

const STUB_DOCKER = `#!/bin/bash
echo "$*" >> "$STUB_CALLS"
echo "passphrase=\${BACKUP_PASSPHRASE:-}" >> "$STUB_CALLS"
if [[ "$*" == *backup.mjs* ]]; then
  echo "1 objects, 10 bytes" >&2
  echo "wrote backups/chiban-backup-2027-06-02.bin"
fi
if [[ "$*" == *restore-verify.mjs* && "\${STUB_VERIFY:-ok}" != "ok" ]]; then
  exit 1
fi
exit 0
`

interface Run {
  status: number
  stdout: string
  stderr: string
  calls: string[]
  dir: string
}

interface Options {
  env?: Record<string, string>
  dotEnv?: string
  files?: string[]
  verifyFails?: boolean
}

function run(script: 'backup.sh' | 'restore-verify.sh', args: string[], opts: Options = {}): Run {
  const dir = mkdtempSync(path.join(tmpdir(), 'chiban-backup-script-'))
  const bin = path.join(dir, 'bin')
  const deployDir = path.join(dir, 'deploy')
  const calls = path.join(dir, 'calls.log')
  mkdirSync(bin)
  mkdirSync(path.join(deployDir, 'backups'), { recursive: true })
  writeFileSync(path.join(bin, 'docker'), STUB_DOCKER, { mode: 0o755 })
  for (const [name, text] of [
    ['backup.sh', backup],
    ['restore-verify.sh', verify],
  ] as const) {
    writeFileSync(path.join(deployDir, name), text)
    chmodSync(path.join(deployDir, name), 0o755)
  }
  if (opts.dotEnv !== undefined) writeFileSync(path.join(deployDir, '.env'), opts.dotEnv)
  for (const file of opts.files ?? []) writeFileSync(path.join(deployDir, 'backups', file), 'x')
  writeFileSync(calls, '')
  const result = spawnSync('bash', [path.join(deployDir, script), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BACKUP_PASSPHRASE: '',
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      STUB_CALLS: calls,
      STUB_VERIFY: opts.verifyFails === true ? 'fail' : 'ok',
      ...opts.env,
    },
  })
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
    calls: readFileSync(calls, 'utf8')
      .split('\n')
      .filter((l) => l !== ''),
    dir: deployDir,
  }
}

const PASS = { BACKUP_PASSPHRASE: 'a long enough passphrase' }

describe('backup.sh', () => {
  it('sets strict mode on the line after the shebang', () => {
    expect(backup.split('\n').slice(0, 2)).toEqual(['#!/usr/bin/env bash', 'set -euo pipefail'])
    expect(verify.split('\n').slice(0, 2)).toEqual(['#!/usr/bin/env bash', 'set -euo pipefail'])
  })

  it('refuses to run when the passphrase is empty and starts no container', () => {
    const r = run('backup.sh', [], {
      env: { BACKUP_PASSPHRASE: '' },
      dotEnv: 'BACKUP_PASSPHRASE=\n',
    })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('BACKUP_PASSPHRASE is empty')
    expect(r.calls).toEqual([])
  })

  it('runs the bundled backup entrypoint without a tty and prints the file', () => {
    const r = run('backup.sh', [], { env: PASS })
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('backups/chiban-backup-2027-06-02.bin')
    expect(r.calls[0]).toContain('compose run --rm --no-deps -T')
    expect(r.calls[0]).toContain('app node dist/backup.mjs --dir /srv/target')
    expect(r.calls[0]).toContain('/srv/target/backups')
    expect(r.calls[0]).not.toContain(PASS.BACKUP_PASSPHRASE)
    expect(r.calls[1]).toBe(`passphrase=${PASS.BACKUP_PASSPHRASE}`)
    expect(r.calls).toHaveLength(2)
    expect(existsSync(path.join(r.dir, 'backups'))).toBe(true)
  })

  it('reads the passphrase from .env when the environment has none', () => {
    const r = run('backup.sh', [], { dotEnv: 'X=1\nBACKUP_PASSPHRASE=from the env file ok\n' })
    expect(r.status).toBe(0)
    expect(r.calls[1]).toBe('passphrase=from the env file ok')
  })

  it('--verify checks the file it just wrote', () => {
    const r = run('backup.sh', ['--verify'], { env: PASS, files: ['chiban-backup-2027-06-02.bin'] })
    expect(r.status).toBe(0)
    const verifyCall = r.calls.find((c) => c.includes('restore-verify.mjs'))
    expect(verifyCall).toContain('--file /restore/backup.bin')
    expect(verifyCall).toContain(
      `${path.join(r.dir, 'backups', 'chiban-backup-2027-06-02.bin')}:/restore/backup.bin:ro`,
    )
  })

  it('--verify fails the whole run when verification fails', () => {
    const r = run('backup.sh', ['--verify'], {
      env: PASS,
      files: ['chiban-backup-2027-06-02.bin'],
      verifyFails: true,
    })
    expect(r.status).not.toBe(0)
  })

  it('rejects unknown arguments', () => {
    expect(run('backup.sh', ['--nope'], { env: PASS }).status).toBe(2)
    expect(run('backup.sh', ['--verify', 'x'], { env: PASS }).status).toBe(2)
  })
})

describe('restore-verify.sh', () => {
  it('refuses to run when the passphrase is empty', () => {
    const r = run('restore-verify.sh', [], {
      env: { BACKUP_PASSPHRASE: '' },
      files: ['chiban-backup-1.bin'],
    })
    expect(r.status).toBe(1)
    expect(r.calls).toEqual([])
  })

  it('verifies the newest backup by default', () => {
    const r = run('restore-verify.sh', [], {
      env: PASS,
      files: [
        'chiban-backup-2027-06-01.bin',
        'chiban-backup-2027-06-03.bin',
        'chiban-backup-2027-06-02.bin',
      ],
    })
    expect(r.status).toBe(0)
    expect(r.calls[0]).toContain('chiban-backup-2027-06-03.bin:/restore/backup.bin:ro')
    expect(r.calls[0]).toContain('app node dist/restore-verify.mjs --file /restore/backup.bin')
    expect(r.calls[0]).not.toContain('--keep')
  })

  it('passes --keep through and accepts an explicit file', () => {
    const r = run('restore-verify.sh', ['--keep', 'backups/chiban-backup-2027-06-01.bin'], {
      env: PASS,
      files: ['chiban-backup-2027-06-01.bin'],
    })
    expect(r.status).toBe(0)
    expect(r.calls[0]).toMatch(/restore-verify\.mjs --file \/restore\/backup\.bin --keep$/)
  })

  it('exits non-zero when there is no backup or the check fails', () => {
    expect(run('restore-verify.sh', [], { env: PASS }).status).toBe(1)
    const failed = run('restore-verify.sh', [], {
      env: PASS,
      files: ['chiban-backup-2027-06-01.bin'],
      verifyFails: true,
    })
    expect(failed.status).not.toBe(0)
    expect(run('restore-verify.sh', ['--bogus'], { env: PASS }).status).toBe(2)
  })
})

describe('deployment files', () => {
  it('the env example carries an empty passphrase placeholder', () => {
    expect(envExampleValues(readDeployFile('.env.example')).get('BACKUP_PASSPHRASE')).toBe('')
  })
})
