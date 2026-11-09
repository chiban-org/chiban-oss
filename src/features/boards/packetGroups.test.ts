import { describe, expect, it } from 'vitest'
import { packetGroups } from '@/features/boards/packetGroups'
import type { PacketAgendaItem, PacketCaseItem } from '@/features/boards/packetView'

function item(title: string, patch: Partial<PacketCaseItem> = {}): PacketCaseItem {
  return {
    versionId: title,
    title,
    filename: `${title}.pdf`,
    mark: null,
    withdrawnOn: null,
    withdrawnWhy: null,
    isAgenda: false,
    agendaItemId: null,
    applicationNumber: null,
    siteAddress: null,
    applicantName: null,
    ...patch,
  }
}

const VARIANCE = {
  agendaItemId: 'item-1',
  applicationNumber: 'VAR-2026-0003',
  siteAddress: '2 Scenario Lane',
  applicantName: 'Avery Stone',
}
const SPECIAL = {
  agendaItemId: 'item-2',
  applicationNumber: 'SE-2026-0001',
  siteAddress: '',
  applicantName: null,
}

const AGENDA: PacketAgendaItem[] = [
  { id: 'item-1', number: 1, title: 'Public hearing: Variance VAR-2026-0003' },
  { id: 'item-2', number: 2, title: 'Public hearing: Special exception SE-2026-0001' },
  { id: 'item-3', number: 3, title: 'Approve the November 12 minutes' },
]

describe('a packet grouped by case', () => {
  it('puts the agenda first, then each case under its agenda item in agenda order', () => {
    const groups = packetGroups({
      agenda: AGENDA,
      items: [
        item('Special exception plan', SPECIAL),
        item('Variance plan', VARIANCE),
        item('Agenda for December 15, 2026', { isAgenda: true }),
        item('Variance abutter letter', VARIANCE),
      ],
    })
    expect(groups.map((g) => g.heading)).toEqual([
      'Cover and agenda',
      'Item 1. Public hearing: Variance VAR-2026-0003, 2 Scenario Lane',
      'Item 2. Public hearing: Special exception SE-2026-0001',
    ])
    expect(groups[0]?.items.map((i) => i.title)).toEqual(['Agenda for December 15, 2026'])
    expect(groups[1]?.items.map((i) => i.title)).toEqual([
      'Variance plan',
      'Variance abutter letter',
    ])
    expect(groups[1]?.applicant).toBe('Avery Stone')
    expect(groups[2]?.applicant).toBeNull()
  })

  it('keeps the cover group even with no agenda document, and skips agenda items with nothing filed', () => {
    const groups = packetGroups({ agenda: AGENDA, items: [item('Variance plan', VARIANCE)] })
    expect(groups.map((g) => g.key)).toEqual(['cover', 'item-1'])
    expect(groups[0]?.items).toEqual([])
  })

  it('names an application that is not on the agenda, then collects the rest at the end', () => {
    const groups = packetGroups({
      agenda: [],
      items: [
        item('Site walk notes'),
        item('Septic design', {
          applicationNumber: 'BP-2026-0042',
          siteAddress: '9 Loon Cove Road',
          applicantName: 'Jo Lake',
        }),
      ],
    })
    expect(groups.map((g) => g.heading)).toEqual([
      'Cover and agenda',
      'Application BP-2026-0042, 9 Loon Cove Road',
      'Other documents',
    ])
    expect(groups[1]?.applicant).toBe('Jo Lake')
    expect(groups[2]?.items.map((i) => i.title)).toEqual(['Site walk notes'])
  })
})
