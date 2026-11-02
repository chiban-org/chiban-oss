import { z } from 'zod'
import type { SourceFeature } from '@/features/gis/import/types'
import { parseGeoJsonValue } from '@/features/gis/readers/geojson'
import { err, ok, type Result } from '@/types/result'

export interface EsriError {
  kind: 'unreachable' | 'bad_shape' | 'service_error'
  detail: string
}

export interface EsriDeps {
  fetch: typeof fetch
}

const MAX_PAGES = 10_000

const serviceErrorSchema = z.object({
  error: z.object({ code: z.number().optional(), message: z.string().optional() }),
})

const metadataSchema = z.object({
  maxRecordCount: z.number().int().positive(),
  objectIdField: z.string().min(1),
  fields: z.array(z.object({ name: z.string(), type: z.string() })),
})

const pageSchema = z.object({ exceededTransferLimit: z.boolean().optional() })

async function getJson(
  url: string,
  deps: EsriDeps,
  signal: AbortSignal,
): Promise<Result<unknown, EsriError>> {
  let res: Response
  try {
    res = await deps.fetch(url, { signal })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return err({ kind: 'unreachable', detail: e instanceof Error ? e.message : 'Request failed' })
  }
  if (!res.ok) return err({ kind: 'service_error', detail: `HTTP ${res.status}` })
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return err({ kind: 'bad_shape', detail: 'Response was not JSON' })
  }
  const service = serviceErrorSchema.safeParse(body)
  if (service.success) {
    return err({
      kind: 'service_error',
      detail: `${service.data.error.code ?? ''} ${service.data.error.message ?? ''}`.trim(),
    })
  }
  return ok(body)
}

function queryUrl(layerUrl: string, objectIdField: string, offset: number, count: number): string {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    outSR: '4326',
    f: 'geojson',
    orderByFields: objectIdField,
    resultOffset: String(offset),
    resultRecordCount: String(count),
  })
  return `${layerUrl}/query?${params.toString()}`
}

export async function readEsriLayer(
  layerUrl: string,
  deps: EsriDeps,
  signal: AbortSignal,
): Promise<Result<SourceFeature[], EsriError>> {
  signal.throwIfAborted()
  const base = layerUrl.replace(/\/+$/, '')
  const metaBody = await getJson(`${base}?f=json`, deps, signal)
  if (!metaBody.ok) return metaBody
  const meta = metadataSchema.safeParse(metaBody.value)
  if (!meta.success)
    return err({ kind: 'bad_shape', detail: 'Layer metadata is missing required fields' })
  const { maxRecordCount, objectIdField } = meta.data
  const all: SourceFeature[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = await getJson(
      queryUrl(base, objectIdField, all.length, maxRecordCount),
      deps,
      signal,
    )
    if (!body.ok) return body
    const features = parseGeoJsonValue(body.value)
    const paging = pageSchema.safeParse(body.value)
    if (!features.ok || !paging.success)
      return err({ kind: 'bad_shape', detail: 'Page is not a feature collection' })
    for (const f of features.value) {
      const oid = f.properties[objectIdField]
      all.push({
        ...f,
        rowRef: oid === null || oid === undefined ? String(all.length) : String(oid),
      })
    }
    const more =
      paging.data.exceededTransferLimit === true || features.value.length >= maxRecordCount
    if (!more || features.value.length === 0) return ok(all)
  }
  return err({ kind: 'bad_shape', detail: 'Layer has more pages than the safety limit' })
}
