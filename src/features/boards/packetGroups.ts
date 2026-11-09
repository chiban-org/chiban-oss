import type { PacketAgendaItem, PacketCaseItem } from '@/features/boards/packetView'

export interface PacketGroup {
  key: string
  heading: string
  applicant: string | null
  items: PacketCaseItem[]
}

export const COVER_GROUP = 'cover'

function withAddress(text: string, siteAddress: string | null): string {
  return siteAddress === null || siteAddress.trim() === '' ? text : `${text}, ${siteAddress}`
}

function caseGroup(key: string, heading: string, items: PacketCaseItem[]): PacketGroup {
  const first = items[0]
  return {
    key,
    heading: withAddress(heading, first?.siteAddress ?? null),
    applicant: first?.applicantName ?? null,
    items,
  }
}

function agendaGroups(agenda: readonly PacketAgendaItem[], items: PacketCaseItem[]) {
  return agenda.flatMap((entry) => {
    const filed = items.filter((i) => !i.isAgenda && i.agendaItemId === entry.id)
    return filed.length === 0
      ? []
      : [caseGroup(entry.id, `Item ${entry.number}. ${entry.title}`, filed)]
  })
}

function offAgendaGroups(items: PacketCaseItem[]): PacketGroup[] {
  const byNumber = new Map<string, PacketCaseItem[]>()
  for (const i of items) {
    if (i.isAgenda || i.agendaItemId !== null || i.applicationNumber === null) continue
    byNumber.set(i.applicationNumber, [...(byNumber.get(i.applicationNumber) ?? []), i])
  }
  return [...byNumber].map(([number, filed]) => caseGroup(number, `Application ${number}`, filed))
}

export function packetGroups(view: {
  agenda: readonly PacketAgendaItem[]
  items: PacketCaseItem[]
}): PacketGroup[] {
  const placed = new Set(view.agenda.map((a) => a.id))
  const items = view.items.map((i) =>
    i.agendaItemId !== null && !placed.has(i.agendaItemId) ? { ...i, agendaItemId: null } : i,
  )
  const rest = items.filter(
    (i) => !i.isAgenda && i.agendaItemId === null && i.applicationNumber === null,
  )
  const groups: PacketGroup[] = [
    {
      key: COVER_GROUP,
      heading: 'Cover and agenda',
      applicant: null,
      items: items.filter((i) => i.isAgenda),
    },
    ...agendaGroups(view.agenda, items),
    ...offAgendaGroups(items),
  ]
  if (rest.length > 0) {
    groups.push({ key: 'other', heading: 'Other documents', applicant: null, items: rest })
  }
  return groups
}
