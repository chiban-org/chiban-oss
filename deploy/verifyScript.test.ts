import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readDeployFile } from './composeText'

const script = readDeployFile('verify-anonymous-intake.sh')

function run(args: string[]): { status: number; stderr: string; calls: string } {
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
  const calls = path.join(dir, 'calls.log')
  writeFileSync(calls, '')
  const result = spawnSync('bash', [path.join(deployDir, 'verify-anonymous-intake.sh'), ...args], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, STUB_CALLS: calls },
    encoding: 'utf8',
  })
  return {
    status: result.status ?? -1,
    stderr: result.stderr,
    calls: spawnSync('cat', [calls], { encoding: 'utf8' }).stdout,
  }
}

describe('verify-anonymous-intake.sh', () => {
  it('script refuses to run without a backup dir', () => {
    const result = run([])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('backup_missing')
    expect(result.calls).toBe('')
  })

  it('a backup dir that is not a folder fails before touching docker', () => {
    const result = run(['--backup-dir', '/nonexistent/backups'])
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
})
