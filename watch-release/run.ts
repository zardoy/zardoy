import execa from 'execa'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readJsonFile, writeJsonFile } from 'typed-jsonfile'
import { Octokit } from '@octokit/rest'

type SemverVersion = string
type JsonStore = { [product: string]: SemverVersion }

const __dirname = dirname(fileURLToPath(import.meta.url))
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
})

const reposFromIndex = await readJsonFile<Record<string, { repos: string[]; skipTesting?: string[] }>>('repos.json')
for (const k in reposFromIndex) {
    for (const i in reposFromIndex[k].repos) {
        if (reposFromIndex[k][i].split('/').length === 1) reposFromIndex[k][i] = `${process.env.GITHUB_ACTOR}/${reposFromIndex[k][i]}`
    }
}

// TODO define semver rules!

type ProductConfig = {
    notifyReposGroup: string
} & (
    | {
          repoTag: string
      }
    | {
          // resolveVersion: () => Promise<string>;
      }
)

const products: Record<string, ProductConfig> = {
    vscode: {
        notifyReposGroup: 'vscode-extensions',
        repoTag: 'microsoft/vscode',
    },
}

const currentReleasesPath = join(__dirname, './currentReleases.json')
let currentReleases = await readJsonFile<JsonStore>(currentReleasesPath)

for (const [productName, config] of Object.entries(products)) {
    if ('repoTag' in config) {
        const [owner, repo] = config.repoTag.split('/')
        const {
            data: { tag_name },
        } = await octokit.repos.getLatestRelease({
            owner,
            repo,
        })
        if (tag_name !== currentReleases[productName]) {
            const index = reposFromIndex[config.notifyReposGroup]
            const skipTesting = index.skipTesting ?? []
            for (const repoSlug of index.repos) {
                if (skipTesting.includes(repoSlug)) continue
                const [owner, repo] = repoSlug.split('/')
                await octokit.actions.createWorkflowDispatch({
                    owner,
                    repo,
                    ref: 'main',
                    workflow_id: 'ci.yml',
                })
            }
        }
        currentReleases[productName] = tag_name
    }
    // TODO resolveVersion
}

await writeJsonFile<JsonStore>(currentReleasesPath, currentReleases)

console.log('current', currentReleases)

await execa('git', ['status'], { stdio: 'inherit' })
