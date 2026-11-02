import { describe, expect, it } from 'vitest'
import {
  ACTION_FILES_LIMIT_MB,
  BYTES_PER_MB,
  complaintPhotosProblem,
  SERVER_ACTION_BODY_LIMIT_MB,
} from '@/lib/uploadLimits'

describe('upload limits', () => {
  it('leaves room in the request body for the form fields around the files', () => {
    expect(SERVER_ACTION_BODY_LIMIT_MB).toBeGreaterThan(ACTION_FILES_LIMIT_MB)
  })

  it('accepts several phone-sized photos', () => {
    expect(complaintPhotosProblem([4, 5, 3, 6, 5].map((mb) => mb * BYTES_PER_MB))).toBeNull()
  })

  it('names the limit when the photos add up to more than it', () => {
    const sizes = [ACTION_FILES_LIMIT_MB * BYTES_PER_MB, 1]
    expect(complaintPhotosProblem(sizes)).toBe(
      `The photos add up to more than ${ACTION_FILES_LIMIT_MB} MB. Attach fewer or smaller photos.`,
    )
  })
})
