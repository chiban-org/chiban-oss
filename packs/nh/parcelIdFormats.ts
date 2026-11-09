export interface PackParcelIdFormat {
  key: string
  label: string
  kind: 'digits'
  width: number
  isDisplay: boolean
  example: string
}

export const NH_PARCEL_ID_FORMATS: readonly PackParcelIdFormat[] = [
  {
    key: 'cama15',
    label: 'CAMA number',
    kind: 'digits',
    width: 15,
    isDisplay: false,
    example: '007001000000000',
  },
  {
    key: 'gis12',
    label: 'Map-lot ID',
    kind: 'digits',
    width: 12,
    isDisplay: true,
    example: '007001000000',
  },
]
