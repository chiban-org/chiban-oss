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
    if (element.parentElement?.closest('section, [data-empty-group]') !== null) continue
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

function useSectionIndex() {
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
      setActive((current) => (next.some((e) => e.id === current) ? current : null))
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

  return { body, entries, active }
}

function SectionIndex({ entries, active }: { entries: IndexEntry[]; active: string | null }) {
  if (entries.length < 4) return null
  return (
    <nav aria-label="On this page" className="no-print hidden lg:block">
      <p className="mb-2 text-sm font-semibold text-muted-foreground">On this page</p>
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
    </nav>
  )
}

function JumpMenu({ entries }: { entries: IndexEntry[] }) {
  if (entries.length < 4) return null
  return (
    <nav aria-label="Jump to a section" className="no-print lg:hidden">
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground">
        On this page
        <select
          value=""
          onChange={(event) => document.getElementById(event.target.value)?.scrollIntoView()}
          className="rounded-md border border-control-border bg-surface px-3 py-2 font-normal text-ink"
        >
          <option value="">Choose a section</option>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
    </nav>
  )
}

interface RecordLayoutProps {
  children: ReactNode
  rail?: ReactNode
  railFooter?: ReactNode
  strip?: ReactNode
  empty?: ReactNode[]
}

const STICKY_MARGIN_PX = 48

function useTallRail() {
  const aside = useRef<HTMLElement>(null)
  const [tall, setTall] = useState(false)
  useEffect(() => {
    const measure = () => {
      const node = aside.current
      if (node !== null) setTall(node.scrollHeight > window.innerHeight - STICKY_MARGIN_PX)
    }
    measure()
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (aside.current !== null) resized?.observe(aside.current)
    window.addEventListener('resize', measure)
    return () => {
      resized?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  return { aside, tall }
}

export function RecordLayout({ children, rail, railFooter, strip, empty }: RecordLayoutProps) {
  const { body, entries, active } = useSectionIndex()
  const { aside, tall } = useTallRail()
  const collapsed = strip !== undefined
  return (
    <div className="record-layout lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-8">
      {collapsed ? (
        <div className="record-strip mb-5 flex flex-col gap-4 lg:hidden">{strip}</div>
      ) : null}
      <aside
        ref={aside}
        data-tall={tall ? '' : undefined}
        className={`record-rail mb-6 flex-col gap-6 lg:order-2 lg:mb-0 lg:sticky lg:top-6 lg:flex lg:data-tall:static ${collapsed ? 'hidden' : 'flex'}`}
      >
        {rail}
        <SectionIndex entries={entries} active={active} />
        {railFooter}
      </aside>
      <div ref={body} className="record-body flex min-w-0 flex-col gap-5">
        <JumpMenu entries={entries} />
        {children}
        {empty === undefined ? null : (
          <div data-empty-group="" className="record-empty">
            <p className="record-empty-title">Nothing recorded yet</p>
            {empty}
          </div>
        )}
      </div>
    </div>
  )
}
