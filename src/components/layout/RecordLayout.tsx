'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { JumpMenu, SectionIndex, useSectionIndex } from './sectionIndex'

interface RecordLayoutProps {
  children: ReactNode
  rail?: ReactNode
  railFooter?: ReactNode
  strip?: ReactNode
  empty?: ReactNode[]
  history?: ReactNode[]
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

function HistoryGroup({ panels }: { panels: ReactNode[] | undefined }) {
  if (panels === undefined || panels.length === 0) return null
  return (
    <details data-history-group="" className="record-history">
      <summary>Record and history</summary>
      {panels}
    </details>
  )
}

export function RecordLayout({
  children,
  rail,
  railFooter,
  strip,
  empty,
  history,
}: RecordLayoutProps) {
  const { body, entries, active } = useSectionIndex()
  const { aside, tall } = useTallRail()
  const collapsed = strip !== undefined
  const railless = rail === undefined && railFooter === undefined
  return (
    <div className="record-layout lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-8">
      <div data-index-gutter="" className="record-gutter hidden min-[1840px]:block">
        <SectionIndex entries={entries} active={active} className="sticky top-6" />
      </div>
      {collapsed ? (
        <div className="record-strip mb-5 flex flex-col gap-4 lg:hidden">{strip}</div>
      ) : null}
      <aside
        ref={aside}
        data-tall={tall ? '' : undefined}
        className={`record-rail mb-6 flex-col gap-6 lg:order-2 lg:mb-0 lg:sticky lg:top-6 lg:flex lg:data-tall:static ${collapsed || railless ? 'hidden' : 'flex'}`}
      >
        {rail}
        <SectionIndex entries={entries} active={active} className="hidden lg:max-[1839px]:block" />
        {railFooter}
      </aside>
      <div ref={body} className="record-body flex min-w-0 flex-col gap-5">
        <JumpMenu entries={entries} />
        {children}
        <HistoryGroup panels={history} />
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
