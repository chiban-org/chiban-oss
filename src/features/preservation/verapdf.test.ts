import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createVeraPdfValidator, PDFA_PROFILE } from '@/features/preservation/verapdf'

const signal = () => AbortSignal.timeout(30_000)
const PDF = new TextEncoder().encode('%PDF-1.7 fake')

function fakeBinary(body: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'chiban-fake-verapdf-'))
  const file = path.join(dir, 'verapdf')
  writeFileSync(file, `#!/bin/sh\n${body}\n`)
  chmodSync(file, 0o755)
  return file
}

const report = (job: object) =>
  JSON.stringify({
    report: {
      buildInformation: { releaseDetails: [{ id: 'apps', version: '1.30.0' }] },
      jobs: [job],
    },
  })

const compliant = report({
  validationResult: [
    {
      details: { passedRules: 144, failedRules: 0, ruleSummaries: [] },
      profileName: 'PDF/A-2b validation profile',
      compliant: true,
    },
  ],
})

const nonCompliant = report({
  validationResult: [
    {
      details: {
        passedRules: 140,
        failedRules: 1,
        ruleSummaries: [
          {
            clause: '6.2.11.4.1',
            description: 'The font programs for all fonts used for rendering shall be embedded',
            failedChecks: 2,
          },
        ],
      },
      profileName: 'PDF/A-2b validation profile',
      compliant: false,
    },
  ],
})

const unreadable = report({ taskException: { message: 'not a PDF' } })

describe('veraPDF validator', () => {
  it('records a pass with the profile and the veraPDF version', async () => {
    const validator = createVeraPdfValidator({
      path: fakeBinary(`cat <<'JSON'\n${compliant}\nJSON`),
      timeoutMs: 30_000,
    })
    expect(await validator.validate(PDF, signal())).toEqual({
      status: 'passed',
      profile: PDFA_PROFILE,
      validator: 'veraPDF',
      version: '1.30.0',
      detail: null,
    })
  })

  it('records a fail with the first rules that failed', async () => {
    const validator = createVeraPdfValidator({
      path: fakeBinary(`cat <<'JSON'\n${nonCompliant}\nJSON\nexit 1`),
      timeoutMs: 30_000,
    })
    const result = await validator.validate(PDF, signal())
    expect(result).toMatchObject({ status: 'failed', profile: PDFA_PROFILE, validator: 'veraPDF' })
    expect(result.detail).toContain('6.2.11.4.1')
    expect(result.detail).toContain('embedded')
  })

  it('records a fail when veraPDF cannot read the file', async () => {
    const validator = createVeraPdfValidator({
      path: fakeBinary(`cat <<'JSON'\n${unreadable}\nJSON\nexit 7`),
      timeoutMs: 30_000,
    })
    expect(await validator.validate(PDF, signal())).toMatchObject({
      status: 'failed',
      detail: 'veraPDF could not read the file as a PDF',
    })
  })

  it('says not validated, never passed, when veraPDF is not installed', async () => {
    const validator = createVeraPdfValidator({
      path: '/nonexistent/verapdf',
      timeoutMs: 30_000,
    })
    expect(await validator.validate(PDF, signal())).toEqual({
      status: 'not_validated',
      profile: PDFA_PROFILE,
      validator: null,
      version: null,
      detail: 'veraPDF is not installed or not configured',
    })
  })

  it('says not validated when veraPDF crashes without a report', async () => {
    const validator = createVeraPdfValidator({
      path: fakeBinary('echo boom >&2\nexit 3'),
      timeoutMs: 30_000,
    })
    const result = await validator.validate(PDF, signal())
    expect(result.status).toBe('not_validated')
    expect(result.detail).toContain('boom')
  })

  it('says not validated when veraPDF runs out of time', async () => {
    const validator = createVeraPdfValidator({ path: fakeBinary('sleep 5'), timeoutMs: 200 })
    expect(await validator.validate(PDF, signal())).toMatchObject({
      status: 'not_validated',
      detail: 'veraPDF exceeded its time limit',
    })
  })
})
