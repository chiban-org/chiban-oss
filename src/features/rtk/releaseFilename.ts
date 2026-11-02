const EXTENSION = /\.([A-Za-z0-9]{1,8})$/
const NOT_FILENAME_SAFE = /[^A-Za-z0-9 .,_()'-]+/g
const MAX_TITLE_CHARS = 120

export function releaseFilename(title: string, storedFilename: string): string {
  const base = title
    .replace(NOT_FILENAME_SAFE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_CHARS)
    .trim()
  if (base === '') return storedFilename
  const extension = EXTENSION.exec(storedFilename)?.[1]?.toLowerCase()
  if (extension === undefined || base.toLowerCase().endsWith(`.${extension}`)) return base
  return `${base}.${extension}`
}
