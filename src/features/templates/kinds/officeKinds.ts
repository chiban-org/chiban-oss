import { packVocabulary, type Vocabulary } from '@/features/packs/vocabulary'
import { doc, fields, heading, para, section } from '@/features/templates/doc/build'
import type { DocumentKindDef } from '@/features/templates/kinds/kindTypes'

export function rtkResponseWords(words: Pick<Vocabulary, 'recordsLaw' | 'recordsRequest'>): {
  label: string
  title: string
  record: string
} {
  return {
    label: `${words.recordsLaw} response`,
    title: `Response to your ${words.recordsRequest}`,
    record: words.recordsRequest,
  }
}

export const RTK_RESPONSE_KIND: DocumentKindDef = {
  get label() {
    return rtkResponseWords(packVocabulary()).label
  },
  get title() {
    return rtkResponseWords(packVocabulary()).title
  },
  get record() {
    return rtkResponseWords(packVocabulary()).record
  },
  scale: 'document',
  fields: ['rtk.number', 'rtk.receivedOn', 'rtk.description'],
  sections: [
    { name: 'rtk.response', label: 'How the town is responding' },
    { name: 'rtk.timeStatements', label: 'Time the town needs' },
    { name: 'rtk.released', label: 'Records released' },
    { name: 'rtk.withheld', label: 'Records withheld or redacted' },
  ],
  locked: [],
  defaultDoc: doc(
    fields([
      ['Request number', 'rtk.number'],
      ['Received', 'rtk.receivedOn'],
      ['Your request', 'rtk.description'],
    ]),
    section('rtk.response'),
    section('rtk.timeStatements'),
    heading('Records released'),
    section('rtk.released'),
    heading('Records withheld or redacted'),
    section('rtk.withheld'),
  ),
}

export const RECEIPT_KIND: DocumentKindDef = {
  label: 'Receipt',
  title: 'Payment receipt',
  record: 'Receipt',
  scale: 'document',
  fields: [
    'receipt.number',
    'receipt.date',
    'receipt.payerName',
    'receipt.total',
    'receipt.footer',
  ],
  sections: [
    { name: 'receipt.details', label: 'Payment details' },
    { name: 'receipt.lines', label: 'What was paid' },
    { name: 'receipt.simulatedNotice', label: 'Test payment notice' },
  ],
  locked: [],
  defaultDoc: doc(
    section('receipt.details'),
    section('receipt.lines'),
    section('receipt.simulatedNotice'),
    para('{{receipt.footer}}'),
  ),
}
