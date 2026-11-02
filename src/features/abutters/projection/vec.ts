export type Pt = [number, number]

export function sub(a: Pt, b: Pt): Pt {
  return [a[0] - b[0], a[1] - b[1]]
}

export function add(a: Pt, b: Pt): Pt {
  return [a[0] + b[0], a[1] + b[1]]
}

export function scale(a: Pt, k: number): Pt {
  return [a[0] * k, a[1] * k]
}

export function dot(a: Pt, b: Pt): number {
  return a[0] * b[0] + a[1] * b[1]
}

export function cross(a: Pt, b: Pt): number {
  return a[0] * b[1] - a[1] * b[0]
}

export function length(a: Pt): number {
  return Math.hypot(a[0], a[1])
}

export function dist(a: Pt, b: Pt): number {
  return length(sub(a, b))
}

export function unit(a: Pt): Pt {
  const len = length(a)
  return len === 0 ? [0, 0] : [a[0] / len, a[1] / len]
}

export function leftNormal(a: Pt): Pt {
  return unit([-a[1], a[0]])
}
