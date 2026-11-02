import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { parseArgs } from 'node:util'
import { decryptStream } from '@/features/export/recovery/envelope'

function readPassphrase(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('the passphrase is read from the terminal'))
      return
    }
    process.stderr.write(prompt)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    let typed = ''
    const onData = (chunk: Buffer): void => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.off('data', onData)
          process.stderr.write('\n')
          resolve(typed)
          return
        }
        if (ch === '\u0003') {
          process.stdin.setRawMode(false)
          reject(new Error('cancelled'))
          return
        }
        typed = ch === '\u007f' ? typed.slice(0, -1) : typed + ch
      }
    }
    process.stdin.on('data', onData)
  })
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { in: { type: 'string' }, out: { type: 'string' } },
})
if (positionals[0] !== 'decrypt' || values.in === undefined || values.out === undefined) {
  process.stderr.write('usage: chiban-recover decrypt --in <file.bin> --out <file.tar>\n')
  process.exit(2)
}
const passphrase = await readPassphrase('Recovery passphrase: ')
try {
  await pipeline(
    decryptStream(createReadStream(values.in), passphrase),
    createWriteStream(values.out),
  )
  process.stdout.write(`wrote ${values.out}\n`)
} catch {
  process.stderr.write('could not decrypt: wrong passphrase or damaged file\n')
  process.exit(1)
}
