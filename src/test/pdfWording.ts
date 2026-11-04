import { pdfText } from '@/test/pdfText'

export async function pdfWording(bytes: Uint8Array): Promise<string> {
  const text = await pdfText(bytes)
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
}
