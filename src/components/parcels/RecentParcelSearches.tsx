'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { parseRecent, rememberSearch, searchHref } from '@/features/parcels/recentSearches'

function storageKey(userId: string, list: string): string {
  return `chiban.${list}.${userId}`
}

function load(key: string): string[] {
  try {
    return parseRecent(window.localStorage.getItem(key))
  } catch {
    return []
  }
}

function save(key: string, list: readonly string[]) {
  try {
    if (list.length === 0) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(list))
  } catch {
    return
  }
}

export function RecentParcelSearches({
  userId,
  record,
  hrefBase,
  param = 'q',
  list = 'recentParcelSearches',
  query,
}: {
  userId: string
  record: string | null
  hrefBase: string
  param?: string
  list?: string
  query?: Readonly<Record<string, string>>
}) {
  const [recent, setRecent] = useState<string[] | null>(null)
  useEffect(() => {
    const key = storageKey(userId, list)
    const next = record === null ? load(key) : rememberSearch(load(key), record)
    save(key, next)
    setRecent(next)
  }, [userId, record, list])
  if (recent === null || recent.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-muted-foreground">Recent</span>
      {recent.map((q) => (
        <Button
          key={q}
          asChild
          variant="outline"
          size="xs"
          className="max-w-full shrink text-sm font-normal no-underline"
        >
          <Link href={searchHref(hrefBase, param, q, query)} title={q}>
            <span className="truncate">{q}</span>
          </Link>
        </Button>
      ))}
      <button
        type="button"
        onClick={() => {
          save(storageKey(userId, list), [])
          setRecent([])
        }}
        className="cursor-pointer px-1 text-muted-foreground underline hover:text-ink"
      >
        Clear
      </button>
    </div>
  )
}
