import { z } from 'zod'
import { GEOMETRY_LAYER_KEYS, LAYER_ADAPTERS, LAYER_KEYS } from '@/features/gis/exceptionKinds'
import { inputField } from '@/features/input/field'
import {
  checkbox,
  choice,
  optionalChoice,
  optionalText,
  optionalWebAddress,
  wholeNumber,
} from '@/features/input/schemas'
import { err, ok } from '@/types/result'
import { BAD_CAMA_MAPPING, CAMA_TOO_LARGE, EMPTY_FILE, NO_CAMA_FILE } from './gisCopy'

const MAX_STALE_DAYS = 3650
const MAX_REFRESH_HOURS = 720
const MAX_SOURCE_URL = 2000
const MAX_MAPPING = 200_000
export const MAX_CAMA_BYTES = 50 * 1024 * 1024

export const LAYER_SETTINGS_FORM = z.object({
  key: choice('a layer', LAYER_KEYS),
  adapter: optionalChoice('an adapter', LAYER_ADAPTERS),
  sourceUrl: optionalWebAddress('the source address', MAX_SOURCE_URL),
  mapping: optionalText('a mapping', { max: MAX_MAPPING }),
  staleAfterDays: wholeNumber('the days before data is stale', { min: 1, max: MAX_STALE_DAYS }),
  refreshIntervalHours: wholeNumber('the hours between refreshes', {
    min: 1,
    max: MAX_REFRESH_HOURS,
  }),
})

export const REFRESH_FORM = z.object({ key: choice('a layer', GEOMETRY_LAYER_KEYS) })

const camaFile = () =>
  inputField((raw) => {
    if (!(raw instanceof File)) return err(NO_CAMA_FILE)
    if (raw.size === 0) return err(EMPTY_FILE)
    return raw.size > MAX_CAMA_BYTES ? err(CAMA_TOO_LARGE) : ok(raw)
  })

const camaMapping = () =>
  inputField((raw) => {
    try {
      return ok(JSON.parse(typeof raw === 'string' ? raw : '') as unknown)
    } catch {
      return err(BAD_CAMA_MAPPING)
    }
  })

export const CAMA_PREVIEW_FORM = z.object({ file: camaFile(), mapping: camaMapping() })

export const CAMA_RUN_FORM = z.object({
  file: camaFile(),
  mapping: camaMapping(),
  fullLayer: checkbox(),
})

export const CAMA_MAPPING_FORM = z.object({ mapping: camaMapping() })
