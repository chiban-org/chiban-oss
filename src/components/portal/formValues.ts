function appendValue(data: FormData, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) if (typeof item === 'string') data.append(key, item)
  } else if (typeof value === 'boolean') {
    data.set(key, value ? 'true' : 'false')
  } else if (typeof value === 'string' || typeof value === 'number') {
    data.set(key, String(value))
  }
}

export function toFormData(
  values: Record<string, unknown>,
  extra: Record<string, string>,
): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(extra)) data.set(key, value)
  for (const [key, value] of Object.entries(values)) appendValue(data, key, value)
  return data
}
