'use client'

import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { SelectField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import { attempt } from '@/lib/attempt'

const ADAPTERS = [
  ['file_geojson', 'GeoJSON (.geojson, .json)'],
  ['file_shapefile', 'Shapefile (.zip with .prj)'],
  ['file_geopackage', 'GeoPackage (.gpkg)'],
] as const

const ERROR_COPY: Record<string, string> = {
  csrf: 'Your session expired. Reload the page and try again.',
  forbidden: 'You do not have permission to run imports.',
  import_in_progress: 'Another import of this layer is running. Try again in a moment.',
  too_large: 'That file is larger than 100 MB.',
  bad_request: 'Choose a file and a format.',
  layer_not_configured: 'This layer is not configured.',
  invalid_mapping: 'The layer mapping is not valid. Fix it in the layer settings.',
  import_failed: 'The import failed. The details are on the layer card.',
}

interface UploadBody {
  runId?: string
  error?: string
  kind?: string
  detail?: string
}

interface ImportUploadFormProps {
  layerKey: string
  primary: boolean
}

function describe(body: UploadBody): string {
  if (body.error === 'reader')
    return `The file could not be read: ${body.detail ?? body.kind ?? 'unknown problem'}.`
  return ERROR_COPY[body.error ?? ''] ?? 'The upload failed. Try again.'
}

export function ImportUploadForm({ layerKey, primary }: ImportUploadFormProps) {
  const [pending, setPending] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = new FormData(event.currentTarget)
    setError(null)
    setRunId(null)
    const result = await attempt(async () => {
      const res = await fetch('/api/staff/gis-imports', { method: 'POST', body })
      return (await res.json()) as UploadBody
    }, setPending)
    if (!result.ok)
      return setError('The upload could not be sent. Check your connection and try again.')
    if (result.value.runId === undefined) return setError(describe(result.value))
    setRunId(result.value.runId)
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-3">
      <CsrfField />
      <input type="hidden" name="layerKey" value={layerKey} />
      <SelectField label="File format" name="adapter" options={ADAPTERS} />
      <label className="block text-sm font-medium">
        File
        <input type="file" name="file" required className="mt-1 block w-full text-sm" />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant={primary ? 'default' : 'outline'} disabled={pending}>
          {pending ? 'Importing' : 'Run import'}
        </Button>
        <p role="status" className="text-sm">
          {error}
          {runId === null ? null : (
            <Link href={`/staff/gis/imports/${runId}`} className="text-action underline">
              Import finished. View the run report.
            </Link>
          )}
        </p>
      </div>
    </form>
  )
}
