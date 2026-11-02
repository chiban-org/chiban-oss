export function isAdjacent(distanceFt: number, toleranceFt: number): boolean {
  return distanceFt <= toleranceFt
}

export function isCaptured(distanceFt: number, captureRadiusFt: number): boolean {
  return distanceFt <= captureRadiusFt
}
