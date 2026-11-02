export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

export function words(raw: string): string {
  const spaced = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
