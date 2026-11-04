import type { AssociationOfficer, ParkTenant } from '@/db/schema'

const SEPARATOR = '|'
const NEWLINES = /\r?\n/

function lines(input: string): string[][] {
  return input
    .split(NEWLINES)
    .map((l) => l.split(SEPARATOR).map((part) => part.trim()))
    .filter((parts) => parts.some((p) => p !== ''))
}

export function parseOfficers(input: string): AssociationOfficer[] {
  return lines(input).map(([name = '', title = '', mailingAddress = '']) => ({
    name,
    title,
    mailingAddress,
  }))
}

export function parseTenants(input: string): ParkTenant[] {
  return lines(input).map(([name = '', siteLabel = '', mailingAddress = ''], index) => ({
    tenantId:
      siteLabel === '' ? `tenant-${index + 1}` : siteLabel.toLowerCase().replaceAll(/\s+/g, '-'),
    name,
    siteLabel,
    mailingAddress,
  }))
}

function joined(parts: string[]): string {
  return parts.map((p) => p.replaceAll(/\s*[|\r\n]+\s*/g, ' ').trim()).join(` ${SEPARATOR} `)
}

export function officerLines(officers: readonly AssociationOfficer[]): string {
  return officers.map((o) => joined([o.name, o.title, o.mailingAddress])).join('\n')
}

export function tenantLines(tenants: readonly ParkTenant[]): string {
  return tenants.map((t) => joined([t.name, t.siteLabel, t.mailingAddress])).join('\n')
}
