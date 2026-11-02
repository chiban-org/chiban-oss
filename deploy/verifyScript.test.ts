import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readDeployFile } from './composeText'

const script = readDeployFile('verify-anonymous-intake.sh')

function run(
  args: string[],
  options: { passphrase?: string; dotEnv?: string } = {},
): { status: number; stderr: string; calls: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'chiban-verify-script-'))
  const bin = path.join(dir, 'bin')
  const deployDir = path.join(dir, 'deploy')
  mkdirSync(bin)
  mkdirSync(deployDir)
  writeFileSync(path.join(bin, 'docker'), '#!/bin/bash\necho "$*" >> "$STUB_CALLS"\nexit 0\n', {
    mode: 0o755,
  })
  writeFileSync(path.join(deployDir, 'verify-anonymous-intake.sh'), script, { mode: 0o755 })
  writeFileSync(path.join(deployDir, 'Caddyfile'), 'x\n')
  if (options.dotEnv !== undefined) writeFileSync(path.join(deployDir, '.env'), options.dotEnv)
  const calls = path.join(dir, 'calls.log')
  writeFileSync(calls, '')
  const result = spawnSync('bash', [path.join(deployDir, 'verify-anonymous-intake.sh'), ...args], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      STUB_CALLS: calls,
      BACKUP_PASSPHRASE: options.passphrase ?? '',
    },
    encoding: 'utf8',
  })
  return {
    status: result.status ?? -1,
    stderr: result.stderr,
    calls: spawnSync('cat', [calls], { encoding: 'utf8' }).stdout,
  }
}

describe('verify-anonymous-intake.sh', () => {
  const PASSPHRASE = 'correct horse battery staple'

  it('script refuses to run without a backup dir', () => {
    const result = run([], { passphrase: PASSPHRASE })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('backup_missing')
    expect(result.calls).toBe('')
  })

  it('a backup dir that is not a folder fails before touching docker', () => {
    const result = run(['--backup-dir', '/nonexistent/backups'], { passphrase: PASSPHRASE })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('backup_missing')
    expect(result.calls).toBe('')
  })

  it('an unknown option prints the usage', () => {
    const result = run(['--nope'])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('usage: verify-anonymous-intake.sh')
  })

  it('the submit step, the log capture, and the check step run in that order', () => {
    const order = ['submit', 'logs --no-color', 'anonymous-intake-verify.mjs check']
    const positions = order.map((needle) => script.indexOf(needle))
    expect(positions.every((p) => p > 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('the control request is removed from the logs the check reads', () => {
    expect(script).toContain('grep -vF "$control"')
    expect(script).toContain('remote_ip')
  })

  it('the check refuses a run whose control request is not in the access log', () => {
    expect(script).toContain('logging was off during the run')
  })

  it('script refuses to run without the backup passphrase', () => {
    const result = run(['--backup-dir', '/tmp'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('BACKUP_PASSPHRASE is empty')
    expect(result.calls).toBe('')
  })

  it('the passphrase is read from the env file like backup.sh does', () => {
    const result = run(['--backup-dir', '/tmp'], { dotEnv: `BACKUP_PASSPHRASE=${PASSPHRASE}\n` })
    expect(result.stderr).not.toContain('BACKUP_PASSPHRASE is empty')
  })

  it('the check step hands the passphrase to the container', () => {
    const checkStep = script.slice(script.indexOf('anonymous-intake-verify.mjs check') - 400)
    expect(checkStep).toContain('-e BACKUP_PASSPHRASE')
  })
})
