import path from 'node:path'
import { copyMaplibreWorker } from './copyMaplibreWorker'

copyMaplibreWorker(path.join(process.cwd(), 'public'))
