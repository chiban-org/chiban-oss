'use client'

import { useRouter } from 'next/navigation'
import {
  createPhotoUploadIntentAction,
  finalizePhotoUploadAction,
} from '@/app/(staff)/staff/inspections/[inspectionId]/actions'
import { Uploader } from '@/components/documents/Uploader'

const PHOTO_LIMIT_BYTES = 25 * 1024 * 1024

export function InspectionPhotoUploader({ inspectionId }: { inspectionId: string }) {
  const router = useRouter()
  return (
    <Uploader
      target={{ kind: 'inspection', id: inspectionId }}
      maxBytes={PHOTO_LIMIT_BYTES}
      actions={{ createIntent: createPhotoUploadIntentAction, finalize: finalizePhotoUploadAction }}
      onUploaded={() => router.refresh()}
      accept="image/jpeg,image/png"
      capture="environment"
      fileLabel="Take or choose a photo"
    />
  )
}
