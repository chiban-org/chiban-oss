const COMMENT_LINE = /^\s*%.*$/
const TRAILING_COMMENT = /\s*%[^()]*$/
const SHIPPED_PROFILE = '(srgb.icc)'

export function pdfaDef(shipped: string, iccPath: string): string {
  return `${shipped
    .split('\n')
    .filter((line) => !COMMENT_LINE.test(line))
    .map((line) => line.replace(TRAILING_COMMENT, '').replace(SHIPPED_PROFILE, `(${iccPath})`))
    .join('\n')}\n`
}
