import { spawn } from 'node:child_process'
import { E2E_PORT, E2E_SERVER_ENV } from '../fixtures/settings'
import { prepareDatabase } from './prepareDatabase'
import { runStep } from './runStep'

await prepareDatabase()
await runStep('pnpm', ['build'])

const server = spawn('pnpm', ['exec', 'next', 'start', '--port', String(E2E_PORT)], {
  env: { ...process.env, ...E2E_SERVER_ENV },
  stdio: 'inherit',
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal))
}
server.on('exit', (code) => process.exit(code ?? 0))
