export interface EditorBox {
  id: string
  page: number
  x0: number
  y0: number
  x1: number
  y1: number
  exemptionKey: string
  otherCitation: string
  explanation: string
}

export interface PageGeometry {
  page: number
  src: string
  width: number
  height: number
}

export const MIN_EXPLANATION = 20
export const OTHER_LAW = 'other_law'

export function boxProblems(boxes: EditorBox[]): string[] {
  if (boxes.length === 0) return ['Draw at least one box.']
  const problems: string[] = []
  boxes.forEach((box, index) => {
    const label = `Box ${index + 1} on page ${box.page}`
    if (box.exemptionKey === '') problems.push(`${label}: choose an exemption.`)
    if (box.exemptionKey === OTHER_LAW && box.otherCitation.trim() === '') {
      problems.push(`${label}: enter the law that makes the record confidential.`)
    }
    if (box.explanation.trim().length < MIN_EXPLANATION) {
      problems.push(
        `${label}: explain how the exemption applies (at least ${MIN_EXPLANATION} characters).`,
      )
    }
  })
  return problems
}

export function clampBox(box: EditorBox, geometry: PageGeometry): EditorBox {
  const x0 = Math.max(0, Math.min(box.x0, geometry.width - 1))
  const y0 = Math.max(0, Math.min(box.y0, geometry.height - 1))
  const x1 = Math.max(x0 + 1, Math.min(box.x1, geometry.width))
  const y1 = Math.max(y0 + 1, Math.min(box.y1, geometry.height))
  return { ...box, x0, y0, x1, y1 }
}

export function moveBox(box: EditorBox, dx: number, dy: number, geometry: PageGeometry): EditorBox {
  const w = box.x1 - box.x0
  const h = box.y1 - box.y0
  const x0 = Math.max(0, Math.min(box.x0 + dx, geometry.width - w))
  const y0 = Math.max(0, Math.min(box.y0 + dy, geometry.height - h))
  return { ...box, x0, y0, x1: x0 + w, y1: y0 + h }
}

export function resizeBox(
  box: EditorBox,
  dx: number,
  dy: number,
  geometry: PageGeometry,
): EditorBox {
  return clampBox({ ...box, x1: box.x1 + dx, y1: box.y1 + dy }, geometry)
}

export function serializeBoxes(boxes: EditorBox[], mode: 'pdf' | 'image'): string {
  return JSON.stringify(
    boxes.map((b) => {
      const cited = {
        exemptionKey: b.exemptionKey,
        ...(b.exemptionKey === OTHER_LAW ? { otherCitation: b.otherCitation.trim() } : {}),
        explanation: b.explanation.trim(),
      }
      return mode === 'pdf'
        ? { pdf: { page: b.page, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, ...cited }
        : {
            image: {
              x: Math.round(b.x0),
              y: Math.round(b.y0),
              width: Math.max(1, Math.round(b.x1 - b.x0)),
              height: Math.max(1, Math.round(b.y1 - b.y0)),
            },
            ...cited,
          }
    }),
  )
}
