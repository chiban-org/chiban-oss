import type { PublicTown } from '@/features/town/publicTown'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)
}

const STYLE = `
body{margin:0;background:#f1f5f8;color:#1f1f1f;font:16px/1.5 system-ui,sans-serif}
.bar{background:#fff;border-bottom:1px solid #d5dce3}
.wrap{max-width:72rem;margin:0 auto;padding:12px 16px}
.brand{font:600 1.5rem/1.2 Georgia,serif;color:#1f1f1f;text-decoration:none;display:inline-flex;min-height:44px;align-items:center}
main.wrap{padding-top:32px;padding-bottom:48px}
h1{font:600 2.25rem/1.15 Georgia,serif;margin:0 0 12px}
a{color:#2a65a3}
.home{display:inline-flex;min-height:44px;align-items:center}
footer{border-top:1px solid #d5dce3;background:#fff;color:#2d2f33}
`

function footerLines(town: PublicTown): string {
  const { office } = town
  const lines = [
    `<strong>${escapeHtml(office.officeName)}</strong>`,
    ...office.addressLines.map(escapeHtml),
    ...(office.phone === '' ? [] : [`Phone ${escapeHtml(office.phone)}`]),
    ...(office.officeHours === '' ? [] : [`Hours: ${escapeHtml(office.officeHours)}`]),
  ]
  return lines.join('<br>')
}

export function refusalPage(town: PublicTown, heading: string, text: string): string {
  const name = escapeHtml(town.name)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(heading)} · ${name}</title><style>${STYLE}</style></head><body><header class="bar"><div class="wrap"><a href="/" class="brand">${name}</a></div></header><main class="wrap"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(text)}</p><p><a href="/" class="home">Go to the home page</a></p></main><footer><div class="wrap"><address style="font-style:normal">${footerLines(town)}</address></div></footer></body></html>`
}
