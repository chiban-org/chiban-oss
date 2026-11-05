import type { AssociationOfficer, ParkTenant } from '@/db/schema'

function column(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((v) => (typeof v === 'string' ? v.trim() : ''))
}

function blank(parts: string[]): boolean {
  return parts.every((p) => p === '')
}

export function officersFrom(formData: FormData): AssociationOfficer[] {
  const names = column(formData, 'officerName')
  const titles = column(formData, 'officerTitle')
  const addresses = column(formData, 'officerAddress')
  return names
    .map((name, i) => ({ name, title: titles.at(i) ?? '', mailingAddress: addresses.at(i) ?? '' }))
    .filter((o) => !blank([o.name, o.title, o.mailingAddress]))
}

function siteId(siteLabel: string, position: number): string {
  return siteLabel === '' ? `tenant-${position}` : siteLabel.toLowerCase().replaceAll(/\s+/g, '-')
}

function unique(wanted: string, taken: Set<string>): string {
  let id = wanted
  for (let n = 2; taken.has(id); n += 1) id = `${wanted}-${n}`
  taken.add(id)
  return id
}

export function tenantsFrom(formData: FormData): ParkTenant[] {
  const ids = column(formData, 'tenantId')
  const names = column(formData, 'tenantName')
  const sites = column(formData, 'tenantSite')
  const addresses = column(formData, 'tenantAddress')
  const rows = names
    .map((name, i) => ({
      tenantId: ids.at(i) ?? '',
      name,
      siteLabel: sites.at(i) ?? '',
      mailingAddress: addresses.at(i) ?? '',
      position: i + 1,
    }))
    .filter((t) => !blank([t.name, t.siteLabel, t.mailingAddress]))
  const taken = new Set(rows.map((t) => t.tenantId).filter((id) => id !== ''))
  return rows.map(({ position, ...t }) => ({
    ...t,
    tenantId: t.tenantId === '' ? unique(siteId(t.siteLabel, position), taken) : t.tenantId,
  }))
}
