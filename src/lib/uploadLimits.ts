export const BYTES_PER_MB = 1024 * 1024
export const ACTION_FILES_LIMIT_MB = 60
export const SERVER_ACTION_BODY_LIMIT_MB = 64

export function complaintPhotosProblem(sizes: number[]): string | null {
  const total = sizes.reduce((sum, size) => sum + size, 0)
  if (total <= ACTION_FILES_LIMIT_MB * BYTES_PER_MB) return null
  return `The photos add up to more than ${ACTION_FILES_LIMIT_MB} MB. Attach fewer or smaller photos.`
}
