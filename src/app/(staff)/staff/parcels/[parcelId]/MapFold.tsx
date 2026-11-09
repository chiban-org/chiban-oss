'use client'

import { useState, useSyncExternalStore } from 'react'
import { LinkedParcelMap } from '@/components/map/LinkedParcelMap'
import { Button } from '@/components/ui/button'

type MapProps = Parameters<typeof LinkedParcelMap>[0]

const WIDE = '(min-width: 1024px)'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function wideNow(): boolean {
  return window.matchMedia(WIDE).matches
}

function notKnownOnServer(): null {
  return null
}

export function MapFold(props: MapProps) {
  const wide = useSyncExternalStore(subscribe, wideNow, notKnownOnServer)
  const [shown, setShown] = useState(false)
  if (wide === null) return <div className="h-64 max-lg:hidden" />
  if (wide || shown) return <LinkedParcelMap {...props} />
  return (
    <Button type="button" variant="outline" className="self-start" onClick={() => setShown(true)}>
      Show the map
    </Button>
  )
}
