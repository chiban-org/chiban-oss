import { describe, expect, it } from 'vitest'
import { readDeployFile } from './composeText'

const caddyfile = readDeployFile('Caddyfile')

function siteBlock(address: string): string {
  const lines = caddyfile.split('\n')
  const start = lines.findIndex((line) => line === `${address} {`)
  if (start === -1) return ''
  const end = lines.findIndex((line, i) => i > start && line === '}')
  return lines.slice(start + 1, end).join('\n')
}

describe('Caddyfile', () => {
  it('idle timeout is 45s in the global servers block', () => {
    const global = caddyfile.split('\n}\n')[0] ?? ''
    expect(global).toMatch(/servers \{\s+timeouts \{\s+idle 45s\s+\}\s+\}/)
    expect(caddyfile.trimStart().startsWith('{')).toBe(true)
  })

  it('app vhost caps request bodies at 80MB and proxies to the app', () => {
    const block = siteBlock('{$APP_DOMAIN}')
    expect(block).toMatch(/request_body \{\s+max_size 80MB\s+\}/)
    expect(block).toContain('reverse_proxy app:3000')
    expect(block).toContain('Strict-Transport-Security "max-age=31536000"')
  })

  it('s3 vhost proxies to minio:9000 with nosniff and a sandbox CSP', () => {
    const block = siteBlock('s3.{$APP_DOMAIN}')
    expect(block).toContain('reverse_proxy minio:9000')
    expect(block).toContain('X-Content-Type-Options "nosniff"')
    expect(block).toContain(
      `Content-Security-Policy "sandbox; default-src 'none'; frame-ancestors 'none'"`,
    )
    expect(block).toContain('Strict-Transport-Security "max-age=31536000"')
  })

  it('does not cap request bodies on the object storage vhost', () => {
    expect(siteBlock('s3.{$APP_DOMAIN}')).not.toContain('max_size')
  })

  it('anonymous paths skip the access log', () => {
    const block = siteBlock('{$APP_DOMAIN}')
    expect(block).toMatch(
      /@anonymousIntake path \/report-anonymously\* \/intake\/anonymous\* \/_next\/\* \/favicon\.ico$/m,
    )
    expect(block).toMatch(/\blog \{\s+output stdout\s+\}/)
    expect(block).toContain('log_skip @anonymousIntake')
  })

  it('the access log is on for the app vhost so the skip is meaningful', () => {
    expect(siteBlock('{$APP_DOMAIN}')).toMatch(/^\tlog \{/m)
  })
})
