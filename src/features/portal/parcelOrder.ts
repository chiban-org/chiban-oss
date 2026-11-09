const HOUSE_NUMBER = /^\s*(\d+)\s*(.*)$/

function partsOf(address: string): { street: string; number: number } {
  const match = HOUSE_NUMBER.exec(address)
  if (match === null) return { street: address.toLowerCase(), number: Number.POSITIVE_INFINITY }
  return { street: (match[2] ?? '').toLowerCase(), number: Number(match[1]) }
}

export function byHouseNumber<T extends { siteAddress: string | null }>(hits: readonly T[]): T[] {
  return [...hits].sort((a, b) => {
    if (a.siteAddress === null || b.siteAddress === null) {
      return Number(a.siteAddress === null) - Number(b.siteAddress === null)
    }
    const left = partsOf(a.siteAddress)
    const right = partsOf(b.siteAddress)
    return left.street.localeCompare(right.street) || left.number - right.number
  })
}
