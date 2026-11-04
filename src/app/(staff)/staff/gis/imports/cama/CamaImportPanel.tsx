'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import {
  CAMA_DELIMITERS,
  CAMA_ENCODINGS,
  type CamaIdPart,
  type CamaMapping,
} from '@/features/cama/mapping'
import type { CamaPreview } from '@/features/cama/previewCama'
import { attempt } from '@/lib/attempt'
import { previewCamaAction, runCamaImportAction, saveCamaMappingAction } from './actions'
import { ColumnList } from './ColumnList'
import { IdPartsEditor } from './IdPartsEditor'
import { PreviewTable } from './PreviewTable'

const ENCODING_LABELS = {
  auto: 'Detect (UTF-8, else Windows-1252)',
  'utf-8': 'UTF-8',
  'windows-1252': 'Windows-1252',
} as const
const DELIMITER_LABELS = { ',': 'Comma', '\t': 'Tab', '|': 'Pipe' } as const

const MAX_OWNER_COLUMNS = 4
const MAX_ADDRESS_COLUMNS = 6

function cleaned(mapping: CamaMapping): CamaMapping {
  const keep = (columns: string[]) => columns.filter((c) => c !== '')
  const parts = mapping.id.parts.filter((p) => !('column' in p) || p.column !== '')
  return {
    ...mapping,
    id: { ...mapping.id, parts },
    ownerName: { ...mapping.ownerName, columns: keep(mapping.ownerName.columns) },
    mailingAddress: { columns: keep(mapping.mailingAddress.columns) },
    ...(mapping.siteAddress === undefined
      ? {}
      : { siteAddress: { columns: keep(mapping.siteAddress.columns) } }),
  }
}

export function CamaImportPanel({
  saved,
  formats,
}: {
  saved: CamaMapping
  formats: { key: string; label: string }[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [mapping, setMapping] = useState<CamaMapping>(saved)
  const [headers, setHeaders] = useState<string[]>([])
  const [preview, setPreview] = useState<CamaPreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const body = (): FormData => {
    const data = new FormData(formRef.current ?? undefined)
    data.set('mapping', JSON.stringify(cleaned(mapping)))
    return data
  }
  const report = (text: string) => {
    setMessage(text)
    setRunId(null)
  }
  const failed = () => report('The request could not be sent. Check your connection and try again.')

  const onPreview = async () => {
    const result = await attempt(() => previewCamaAction(body()), setPending)
    if (!result.ok) return failed()
    if (!result.value.ok) return report(result.value.error)
    setPreview(result.value.preview)
    setHeaders(result.value.preview.headers)
    report('Preview ready. Check the composed IDs before you run the import.')
  }
  const onSave = async () => {
    const result = await attempt(() => saveCamaMappingAction(body()), setPending)
    if (!result.ok) return failed()
    report(result.value.ok ? result.value.message : result.value.error)
  }
  const onRun = async () => {
    const result = await attempt(() => runCamaImportAction(body()), setPending)
    if (!result.ok) return failed()
    if (!result.value.ok) return report(result.value.error)
    setMessage(result.value.message)
    setRunId(result.value.runId)
    router.refresh()
  }
  const setParts = (parts: CamaIdPart[]) => setMapping({ ...mapping, id: { ...mapping.id, parts } })

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="max-w-3xl space-y-4">
      <CsrfField />
      <TextField label="CAMA file" type="file" name="file" accept=".csv,.txt,text/csv" />
      <div className="flex flex-wrap gap-4">
        <SelectField
          label="Encoding"
          value={mapping.encoding}
          onChange={(e) =>
            setMapping({ ...mapping, encoding: e.target.value as CamaMapping['encoding'] })
          }
          options={CAMA_ENCODINGS.map((v) => [v, ENCODING_LABELS[v]] as const)}
        />
        <SelectField
          label="Delimiter"
          value={mapping.delimiter}
          onChange={(e) =>
            setMapping({ ...mapping, delimiter: e.target.value as CamaMapping['delimiter'] })
          }
          options={CAMA_DELIMITERS.map((v) => [v, DELIMITER_LABELS[v]] as const)}
        />
      </div>
      <Button type="button" variant="outline" disabled={pending} onClick={() => void onPreview()}>
        Read the file and preview
      </Button>
      <h2>Column mapping</h2>
      <SelectField
        label="Parcel ID format"
        value={mapping.id.format}
        onChange={(e) => setMapping({ ...mapping, id: { ...mapping.id, format: e.target.value } })}
        options={formats.map((f) => [f.key, f.label] as const)}
      />
      <IdPartsEditor parts={mapping.id.parts} headers={headers} onChange={setParts} />
      <ColumnList
        label="Owner name"
        columns={mapping.ownerName.columns}
        headers={headers}
        maxColumns={MAX_OWNER_COLUMNS}
        onChange={(columns) =>
          setMapping({ ...mapping, ownerName: { ...mapping.ownerName, columns } })
        }
      />
      <TextField
        label="Joiner between owner names"
        value={mapping.ownerName.joiner}
        onChange={(e) =>
          setMapping({ ...mapping, ownerName: { ...mapping.ownerName, joiner: e.target.value } })
        }
      />
      <ColumnList
        label="Mailing address"
        columns={mapping.mailingAddress.columns}
        headers={headers}
        maxColumns={MAX_ADDRESS_COLUMNS}
        onChange={(columns) => setMapping({ ...mapping, mailingAddress: { columns } })}
      />
      <ColumnList
        label="Site address"
        columns={mapping.siteAddress?.columns ?? ['']}
        headers={headers}
        maxColumns={MAX_ADDRESS_COLUMNS}
        onChange={(columns) => setMapping({ ...mapping, siteAddress: { columns } })}
      />
      {preview === null ? null : <PreviewTable preview={preview} />}
      <CheckField
        label="This file lists every parcel. Report parcels that are missing from it."
        name="fullLayer"
        defaultChecked
      />
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" disabled={pending} onClick={() => void onSave()}>
          Save mapping
        </Button>
        <Button type="button" disabled={pending} onClick={() => void onRun()}>
          Run import
        </Button>
      </div>
      <p role="status" className="text-sm">
        {message}{' '}
        {runId === null ? null : (
          <Link href={`/staff/gis/imports/${runId}`} className="text-action underline">
            View the run report.
          </Link>
        )}
      </p>
    </form>
  )
}
