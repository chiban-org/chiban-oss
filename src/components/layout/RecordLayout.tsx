'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

interface IndexEntry {
  id: string
  label: string
}

interface FoundSection extends IndexEntry {
  element: HTMLElement
}

const ACTIVE_BAND = '0px 0px -70% 0px'

function slug(text: string): string {
  return `section-${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}`
}

function labelOf(section: HTMLElement): string {
  const named = section.getAttribute('aria-label')
  if (named !== null) return named
  const heading = section.querySelector('h2')
  return heading?.textContent.trim() ?? ''
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`
  taken.add(id)
  return id
}

function collectSections(body: HTMLElement): FoundSection[] {
  const taken = new Set<string>()
  const found: FoundSection[] = []
  for (const element of body.querySelectorAll<HTMLElement>('section:not([data-plain])')) {
    if (element.parentElement?.closest('section') !== null) continue
    const label = labelOf(element)
    if (label === '') continue
    if (element.id === '' || taken.has(element.id)) element.id = uniqueId(slug(label), taken)
    else taken.add(element.id)
    found.push({ element, id: element.id, label })
  }
  return found
}

function entriesKey(list: readonly IndexEntry[]): string {
  return list.map((e) => `${e.id}|${e.label}`).join('\n')
}

export function RecordLayout({ children }: { children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null)
  const [entries, setEntries] = useState<IndexEntry[]>([])
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const root = body.current
    if (root === null) return
    const visibility = new IntersectionObserver(
      (records) => {
        const first = records.find((r) => r.isIntersecting)
        if (first !== undefined) setActive(first.target.id)
      },
      { rootMargin: ACTIVE_BAND },
    )
    let frame = 0
    const scan = () => {
      const found = collectSections(root)
      visibility.disconnect()
      for (const section of found) visibility.observe(section.element)
      const next = found.map(({ id, label }) => ({ id, label }))
      setEntries((previous) => (entriesKey(previous) === entriesKey(next) ? previous : next))
    }
    const mutations = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(scan)
    })
    scan()
    mutations.observe(root, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      mutations.disconnect()
      visibility.disconnect()
    }
  }, [])

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_11rem] xl:gap-10">
      <div ref={body} className="min-w-0">
        {children}
      </div>
      {entries.length < 4 ? null : (
        <nav aria-label="On this page" className="no-print hidden xl:block">
          <div className="sticky top-10">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">On this page</p>
            <ul className="flex flex-col border-l">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <a
                    href={`#${entry.id}`}
                    aria-current={entry.id === active ? 'location' : undefined}
                    className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-sm text-muted-foreground no-underline hover:text-ink aria-[current=location]:border-action aria-[current=location]:font-semibold aria-[current=location]:text-ink"
                  >
                    {entry.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}
    </div>
  )
}
