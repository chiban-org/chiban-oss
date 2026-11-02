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
