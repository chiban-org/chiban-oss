'use client'

import { type ParcelMultiPickerProps, ParcelMultiPickerView } from './ParcelMultiPickerView'
import { type ParcelPickerProps, ParcelPickerView } from './ParcelPickerView'
import { staffParcelSearch } from './staffParcelSearch'

export function ParcelPicker(props: ParcelPickerProps) {
  return <ParcelPickerView {...props} search={staffParcelSearch} />
}

export function ParcelMultiPicker(props: ParcelMultiPickerProps) {
  return <ParcelMultiPickerView {...props} search={staffParcelSearch} />
}
