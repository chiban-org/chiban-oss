import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { GEOMETRY_LAYER_KEYS } from '@/features/gis/exceptionKinds'
import { tileFor } from '@/features/gis/tiles'

export const runtime = 'nodejs'

const TILE_TIMEOUT_MS = 10_000
const CACHE_SECONDS = 300

interface TileParams {
  layer: string
  z: string
  x: string
  y: string
}

function isLayer(value: string): value is (typeof GEOMETRY_LAYER_KEYS)[number] {
  return (GEOMETRY_LAYER_KEYS as readonly string[]).includes(value)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<TileParams> },
): Promise<Response> {
  const { layer, z, x, y } = await params
  if (!isLayer(layer)) return NextResponse.json({ error: 'bad_tile' }, { status: 404 })
  const tile = await tileFor(
    db,
    layer,
    Number(z),
    Number(x),
    Number(y.replace(/\.pbf$/, '')),
    AbortSignal.timeout(TILE_TIMEOUT_MS),
  )
  if (!tile.ok) {
    return NextResponse.json({ error: tile.error }, { status: 404 })
  }
  return new Response(tile.value as BodyInit, {
    headers: {
      'content-type': 'application/vnd.mapbox-vector-tile',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
    },
  })
}
