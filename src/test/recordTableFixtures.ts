import type { ParcelHistory } from '@/features/parcels/parcelHistory'
import type { ParcelRecordSummary, RecordDates } from '@/features/parcels/recordSources'
import type { CivilDate } from '@/types/civilDate'

export const PARCEL = 'parcel-1'
export const PATH = `/staff/parcels/${PARCEL}`

export function dates(patch: Partial<Record<keyof RecordDates, string>> = {}): RecordDates {
  return {
    filed: (patch.filed ?? null) as CivilDate | null,
    issued: (patch.issued ?? null) as CivilDate | null,
    expires: (patch.expires ?? null) as CivilDate | null,
    closed: (patch.closed ?? null) as CivilDate | null,
  }
}

export function permit(
  id: string,
  number: string,
  patch: Partial<ParcelRecordSummary> = {},
): ParcelRecordSummary {
  return {
    kind: 'application',
    recordId: id,
    title: 'Electrical permit',
    number,
    status: { label: 'Submitted', chip: 'neutral' },
    date: null,
    href: `/staff/applications/${id}`,
    closed: false,
    type: { key: 'EL', label: 'Electrical permit' },
    dates: dates(),
    ...patch,
  }
}

export function caseRecord(
  id: string,
  patch: Partial<ParcelRecordSummary> = {},
): ParcelRecordSummary {
  return {
    kind: 'enforcement_case',
    recordId: id,
    title: 'Code enforcement case',
    number: `EC-${id}`,
    status: { label: 'Open', chip: 'neutral' },
    date: null,
    href: `/staff/enforcement/${id}`,
    closed: false,
    type: { key: 'enforcement_case', label: 'Code enforcement case' },
    dates: dates(),
    ...patch,
  }
}

export function file(
  id: string,
  owner: { kind: string; id: string },
  added: string,
  patch: Partial<ParcelRecordSummary> = {},
): ParcelRecordSummary {
  return {
    kind: 'document',
    recordId: id,
    title: `File ${id}`,
    number: 'Attachment',
    status: { label: 'Private', chip: 'neutral' },
    date: added as CivilDate,
    href: `/api/documents/${id}`,
    thumbnailHref: `/api/documents/${id}/thumbnail`,
    type: { key: 'document', label: 'File' },
    dates: dates({ filed: added }),
    owner,
    ...patch,
  }
}

export function history(
  own: ParcelRecordSummary[],
  ancestral: ParcelHistory['ancestral'] = [],
): ParcelHistory {
  return { own, ancestral, sourcesRegistered: 5 }
}
