export interface RtkExemption {
  key: string
  paragraph: string
  label: string
  citation: { label: string; url: string }
}

export const OTHER_LAW_EXEMPTION_KEY = 'other_law'
