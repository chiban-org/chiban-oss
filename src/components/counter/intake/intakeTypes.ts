export const SAVE_FOR_LATER = 'later'
export const SAVE_AND_CONTINUE = 'continue'

export type SaveIntent = typeof SAVE_FOR_LATER | typeof SAVE_AND_CONTINUE

export type IntakeSaveResult =
  | { ok: true; message: string; next: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
