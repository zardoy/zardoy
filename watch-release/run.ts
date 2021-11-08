import execa from 'execa'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readJsonFile } from 'typed-jsonfile'
import { Octokit } from '@octokit/rest'

type SemverVersion = string
type JsonStore = { [product: string]: SemverVersion }

const __dirname = dirname(fileURLToPath(import.meta.url))

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
})

const reposFromIndex = await readJsonFile<Record<string, { repos: string[] }>>('repos.json')

const products: Record<string, { notifyRepos: string[] } & ({ repoTag: string } | { resolveVersion: () => Promise<string> })> = {
    vscode: {
        notifyRepos: reposFromIndex['vscode-extensions'].repos,
        repoTag: 'microsoft/vscode',
    },
}

const currentReleasesPath = join(__dirname, './currentReleases.json')
let currentReleases = await readJsonFile<JsonStore>(currentReleasesPath)

octokit.actions.createWorkflowDispatch({
    owner: '',
})
