'use client'

import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import {
  boxProblems,
  clampBox,
  type EditorBox,
  moveBox,
  OTHER_LAW,
  type PageGeometry,
  resizeBox,
  serializeBoxes,
} from '@/components/redaction/boxModel'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'

export interface BoxEditorProps {
  pages: PageGeometry[]
  exemptions: { key: string; label: string }[]
  mode: 'pdf' | 'image'
  onChange?: (boxes: EditorBox[], problems: string[]) => void
}

const STEP = 4
const DEFAULT_SIZE = 80
const PAGES_PER_VIEW = 12
let counter = 0

function nextId(): string {
  counter += 1
  return `box-${counter}`
}

function PageWindows({
  total,
  first,
  onShow,
}: {
  total: number
  first: number
  onShow: (first: number) => void
}) {
  if (total <= PAGES_PER_VIEW) return null
  const starts = Array.from(
    { length: Math.ceil(total / PAGES_PER_VIEW) },
    (_, i) => i * PAGES_PER_VIEW,
  )
  return (
    <nav aria-label="Pages of the document" className="flex flex-wrap gap-2">
      {starts.map((start) => {
        const label = `Show pages ${start + 1} to ${Math.min(start + PAGES_PER_VIEW, total)}`
        const current = start === first
        return (
          <Button
            key={start}
            type="button"
            variant="outline"
            size="sm"
            aria-current={current ? 'page' : undefined}
            disabled={current}
            className="disabled:font-semibold disabled:opacity-100"
            onClick={() => onShow(start)}
          >
            {label}
          </Button>
        )
      })}
    </nav>
  )
}

export function BoxEditor({ pages, exemptions, mode, onChange }: BoxEditorProps) {
  const [boxes, setBoxes] = useState<EditorBox[]>([])
  const [first, setFirst] = useState(0)
  const shown = pages.slice(first, first + PAGES_PER_VIEW)
  const drawing = useRef<{ id: string; originX: number; originY: number; page: number } | null>(
    null,
  )
  const problems = boxProblems(boxes)
  const update = (next: EditorBox[]) => {
    setBoxes(next)
    onChange?.(next, boxProblems(next))
  }
  const geometryOf = (page: number): PageGeometry =>
    pages.find((p) => p.page === page) ?? (pages[0] as PageGeometry)
  const patch = (id: string, change: Partial<EditorBox>) =>
    update(boxes.map((b) => (b.id === id ? { ...b, ...change } : b)))
  const add = (page: number, x0: number, y0: number, x1: number, y1: number): string => {
    const id = nextId()
    update([
      ...boxes,
      clampBox(
        { id, page, x0, y0, x1, y1, exemptionKey: '', otherCitation: '', explanation: '' },
        geometryOf(page),
      ),
    ])
    return id
  }
  const point = (event: PointerEvent<HTMLDivElement>, geometry: PageGeometry) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * geometry.width,
      y: ((event.clientY - rect.top) / rect.height) * geometry.height,
    }
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>, box: EditorBox) => {
    const geometry = geometryOf(box.page)
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    }
    const move = delta[event.key]
    if (move !== undefined) {
      event.preventDefault()
      const [dx, dy] = move
      update(
        boxes.map((b) =>
          b.id === box.id
            ? event.shiftKey
              ? resizeBox(b, dx, dy, geometry)
              : moveBox(b, dx, dy, geometry)
            : b,
        ),
      )
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      update(boxes.filter((b) => b.id !== box.id))
    }
  }
  return (
    <div className="space-y-4">
      <p className="m-0">
        Drag on a page to draw a box over what must be removed. Or add a box with the button, then
        move it with the arrow keys, resize it with Shift and the arrow keys, and remove it with
        Delete.
      </p>
      <PageWindows total={pages.length} first={first} onShow={setFirst} />
      {shown.map((geometry) => (
        <div key={geometry.page} className="space-y-2">
          <p className="m-0 font-medium">{`Page ${geometry.page}`}</p>
          <div
            className="relative max-w-3xl touch-none select-none border"
            style={{ aspectRatio: `${geometry.width} / ${geometry.height}` }}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return
              const p = point(event, geometry)
              const id = add(geometry.page, p.x, p.y, p.x + 1, p.y + 1)
              drawing.current = { id, originX: p.x, originY: p.y, page: geometry.page }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              const active = drawing.current
              if (active === null || active.page !== geometry.page) return
              const p = point(event, geometry)
              setBoxes((current) =>
                current.map((b) =>
                  b.id === active.id
                    ? clampBox(
                        {
                          ...b,
                          x0: Math.min(active.originX, p.x),
                          y0: Math.min(active.originY, p.y),
                          x1: Math.max(active.originX, p.x),
                          y1: Math.max(active.originY, p.y),
                        },
                        geometry,
                      )
                    : b,
                ),
              )
            }}
            onPointerUp={() => {
              drawing.current = null
            }}
          >
            <img
              src={geometry.src}
              loading="lazy"
              alt={`Page ${geometry.page} of the document`}
              className="pointer-events-none block h-full w-full"
              draggable={false}
            />
            {boxes
              .filter((b) => b.page === geometry.page)
              .map((b) => (
                <div
                  key={b.id}
                  role="group"
                  tabIndex={0}
                  aria-label={`Box ${boxes.indexOf(b) + 1} on page ${b.page}`}
                  onKeyDown={(event) => onKey(event, b)}
                  className="absolute bg-black/80 outline-offset-2 focus:outline focus:outline-2 focus:outline-action"
                  style={{
                    left: `${(b.x0 / geometry.width) * 100}%`,
                    top: `${(b.y0 / geometry.height) * 100}%`,
                    width: `${((b.x1 - b.x0) / geometry.width) * 100}%`,
                    height: `${((b.y1 - b.y0) / geometry.height) * 100}%`,
                  }}
                />
              ))}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              add(
                geometry.page,
                geometry.width / 2 - DEFAULT_SIZE,
                geometry.height / 2 - DEFAULT_SIZE / 2,
                geometry.width / 2 + DEFAULT_SIZE,
                geometry.height / 2 + DEFAULT_SIZE / 2,
              )
            }
          >
            {`Add a box to page ${geometry.page}`}
          </Button>
        </div>
      ))}
      <ul className="m-0 list-none space-y-3 p-0">
        {boxes.map((b, index) => (
          <li key={b.id} className="space-y-4 rounded-md border p-4">
            <p className="m-0 font-medium">{`Box ${index + 1} on page ${b.page}`}</p>
            <SelectField
              label="Exemption"
              value={b.exemptionKey}
              onChange={(event) => patch(b.id, { exemptionKey: event.target.value })}
              options={[
                ['', 'Choose an exemption'],
                ...exemptions.map((e) => [e.key, e.label] as const),
              ]}
            />
            {b.exemptionKey === OTHER_LAW ? (
              <TextField
                label="Law that makes it confidential"
                value={b.otherCitation}
                onChange={(event) => patch(b.id, { otherCitation: event.target.value })}
              />
            ) : null}
            <AreaField
              label="How the exemption applies"
              value={b.explanation}
              rows={2}
              onChange={(event) => patch(b.id, { explanation: event.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => update(boxes.filter((x) => x.id !== b.id))}
            >
              Remove this box
            </Button>
          </li>
        ))}
      </ul>
      {problems.length > 0 && boxes.length > 0 ? (
        <ul role="alert" className="m-0 list-none p-0">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <input type="hidden" name="boxes" value={serializeBoxes(boxes, mode)} />
    </div>
  )
}
