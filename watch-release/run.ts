import execa from 'execa'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const currentReleasesPath = join(dirname(fileURLToPath(import.meta.url)), './currentReleases.json')

let currentReleases = await fs.promises.readFile(currentReleasesPath, 'utf-8')
