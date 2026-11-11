export const TEMPLATES_SETTINGS_PATH = '/staff/settings/template'

export const MISSING_TEMPLATE_TEXT =
  'Notice letters need a published template of the kind Hearing notice. Add one in Settings, Permits, Templates, and publish it.'

const ASK_SOMEONE = 'Ask someone who can change settings to add it.'

export function missingTemplateText(canEditSettings: boolean): string {
  return canEditSettings ? MISSING_TEMPLATE_TEXT : `${MISSING_TEMPLATE_TEXT} ${ASK_SOMEONE}`
}

export function missingTemplatePage(canEditSettings: boolean): string {
  const next = canEditSettings
    ? `<p><a href="${TEMPLATES_SETTINGS_PATH}" style="display:inline-block;min-height:44px;line-height:44px">Open the templates in Settings</a></p>`
    : `<p>${ASK_SOMEONE}</p>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No hearing notice template</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;font-size:1rem"><h1>No hearing notice template</h1><p>${MISSING_TEMPLATE_TEXT}</p>${next}</body></html>`
}
