import type { DocumentFrame } from '@/features/pdf/frame'
import type { PdfBlock } from '@/features/pdf/renderPdf'
import { type DocumentInput, renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import type { TemplateBody } from '@/features/templates/templateSchema'

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
  boardShortName: string
  boardChairName: string
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

function itemRows(model: AgendaModel): string[][] {
  return model.items.map((item) => [
    `${item.position + 1}. ${item.title}`,
    item.application?.number ?? '',
    applicantOf(item),
    item.application?.parcelDisplayId ?? '',
    item.application?.siteAddress ?? '',
  ])
}

function itemNotes(model: AgendaModel): PdfBlock[] {
  return model.items
    .filter((item) => item.description.trim() !== '')
    .map(
      (item): PdfBlock => ({
        kind: 'paragraph',
        text: `Item ${item.position + 1} details: ${item.description.trim()}`,
      }),
    )
}

const ITEM_COLUMNS = ['Item', 'Application', 'Applicant', 'Parcel', 'Site address']

export function agendaBlocks(model: AgendaModel): PdfBlock[] {
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
    { kind: 'table', columns: ITEM_COLUMNS, rows: itemRows(model) },
    ...itemNotes(model),
  ]
}

export function agendaDocumentInput(frame: DocumentFrame, model: AgendaModel): DocumentInput {
  return {
    subtitle: model.meetingDate,
    frame,
    context: {
      values: {
        'board.name': model.boardName,
        'board.short_name': model.boardShortName,
        'board.chair.name': model.boardChairName,
        'meeting.date': model.meetingDate,
        'meeting.time': model.time,
        'meeting.location': model.location === '' ? NONE : model.location,
      },
      sections: new Map<string, PdfBlock[]>([
        ['agenda.items', [{ kind: 'table', columns: ITEM_COLUMNS, rows: itemRows(model) }]],
        ['agenda.itemNotes', itemNotes(model)],
      ]),
    },
  }
}

export async function renderAgendaPdf(
  frame: DocumentFrame,
  model: AgendaModel,
  template: TemplateBody | null = null,
): Promise<Uint8Array> {
  return await renderDocumentOrDefault('agenda', template, agendaDocumentInput(frame, model))
}
