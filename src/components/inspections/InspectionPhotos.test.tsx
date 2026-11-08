// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(staff)/staff/inspections/[inspectionId]/actions', () => ({
  createPhotoUploadIntentAction: vi.fn(),
  finalizePhotoUploadAction: vi.fn(),
}))

const { InspectionPhotoUploader } = await import('@/components/inspections/InspectionPhotos')

afterEach(cleanup)

describe('adding a photo to an inspection', () => {
  it('keeps the uploader behind Add a photo, with camera-first copy and no desktop wording', () => {
    render(
      <CsrfProvider token="t1">
        <InspectionPhotoUploader inspectionId="i1" />
      </CsrfProvider>,
    )
    const disclosure = screen.getByText('Add a photo').closest('details')
    expect(disclosure?.open).toBe(false)
    fireEvent.click(screen.getByText('Add a photo'))
    expect(
      screen.getByText('Take a photo with the camera, or choose one already on this device.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Take or choose a photo' })).toBeTruthy()
    expect(screen.getByLabelText('What the photo shows')).toBeTruthy()
    expect(screen.queryByText('Drag a file here or')).toBeNull()
    expect(screen.queryByText('Name for this document')).toBeNull()
  })
})
