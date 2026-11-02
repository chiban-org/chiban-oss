import type { PdfBlock } from '@/features/pdf/renderPdf'

export interface AgendaModelItem {
  position: number
  kind: 'hearing' | 'business' | 'minutes_approval' | 'other'
  title: string
  description: string
  application: {
    number: string
    applicantName: string
    parcelDisplayId: string
    siteAddress: string
  } | null
}

export interface AgendaModel {
  boardName: string
  meetingDate: string
  location: string
  time: string
  items: AgendaModelItem[]
}

const NONE = 'Not recorded'

function applicantOf(item: AgendaModelItem): string {
  if (item.application === null) return ''
  return item.application.applicantName === '' ? NONE : item.application.applicantName
}

export function agendaBlocks(model: AgendaModel): PdfBlock[] {
  const rows = model.items.map((item) => [
    `${item.position + 1}. ${item.title}`,
    item.application?.number ?? '',
    applicantOf(item),
    item.application?.parcelDisplayId ?? '',
    item.application?.siteAddress ?? '',
  ])
  const notes = model.items
    .filter((item) => item.description.trim() !== '')
    .map(
      (item): PdfBlock => ({
        kind: 'paragraph',
        text: `${item.position + 1}. ${item.description.trim()}`,
      }),
    )
  return [
    {
      kind: 'fields',
      rows: [
        { label: 'Board', value: model.boardName },
        { label: 'Date', value: model.meetingDate },
        { label: 'Time', value: model.time },
        { label: 'Location', value: model.location === '' ? NONE : model.location },
      ],
    },
    { kind: 'heading', text: 'Items' },
    {
      kind: 'table',
      columns: ['Item', 'Application', 'Applicant', 'Parcel', 'Site address'],
      rows,
    },
    ...notes,
  ]
}
