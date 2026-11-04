import type { PreviewResult, SamplesResult } from '@/features/templates/preview/templatePreview'
import type { TownProfileBody } from '@/features/town/profileSchema'

export interface TemplateBuilderData {
  kindLocked: boolean
  townName: string
  profile: TownProfileBody | null
  samplesAction: (formData: FormData) => Promise<SamplesResult>
  previewAction: (formData: FormData) => Promise<PreviewResult>
}
