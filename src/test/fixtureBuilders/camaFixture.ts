import { DEFAULT_CAMA_COLUMNS } from '../../features/cama/mapping.ts'
import { buildLots, type GridLot } from './alderPondGrid.ts'

export const ACCENTED_OWNER = 'Désirée Larkspur'

const MAIL_ZIP = '03999'
const MAIL_CITY = 'Alder Pond'
const MAIL_STATE = 'NH'
const FIRST_LOT_INDEX = 0

function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export interface CamaRowInput {
  gis12: string
  unit: string
  owner1: string
  owner2?: string
  mailStreet1: string
  site: { number: string; street: string }
}

export function camaLine(row: CamaRowInput): string {
  const map = row.gis12.slice(0, 3)
  const lot = row.gis12.slice(3, 6)
  const sub = row.gis12.slice(6, 9)
  return [
    map,
    lot,
    sub,
    row.unit,
    row.owner1,
    row.owner2 ?? '',
    row.mailStreet1,
    '',
    MAIL_CITY,
    MAIL_STATE,
    MAIL_ZIP,
    row.site.number,
    row.site.street,
  ]
    .map(cell)
    .join(',')
}

export function rowForLot(lot: GridLot, owner = lot.owner): CamaRowInput {
  const mailStreet1 = lot.mailing.split(',')[0] ?? lot.mailing
  return {
    gis12: lot.gis12,
    unit: (lot.cama[0] ?? '').slice(12),
    owner1: owner,
    mailStreet1,
    site: { number: lot.number, street: lot.street },
  }
}

export function camaCsv(lines: string[]): string {
  return `${DEFAULT_CAMA_COLUMNS.join(',')}\n${lines.join('\n')}\n`
}

export function buildCamaCsv(accented: boolean): string {
  return camaCsv(
    buildLots().map((lot) =>
      camaLine(
        rowForLot(lot, accented && lot.index === FIRST_LOT_INDEX ? ACCENTED_OWNER : lot.owner),
      ),
    ),
  )
}

export function encodeWindows1252(text: string): Uint8Array {
  return Uint8Array.from(
    Array.from(text, (ch) => {
      const code = ch.charCodeAt(0)
      if (code > 0xff) throw new RangeError(`Not representable in Windows-1252: ${ch}`)
      return code
    }),
  )
}
