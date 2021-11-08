// OUTPUTS REPOS LIST
//@ts-check
import fs from 'fs'

const reposIndexes = JSON.parse(await fs.promises.readFile('./repos.json', 'utf-8'))

for (const [group, { repos }] of Object.entries(reposIndexes)) {
    for (const i in repos) {
        if (repos[i].split('/').length === 1) repos[i] = `${process.env.GITHUB_ACTOR}/${repos[i]}`
    }
    console.log(`::set-output name=${group}::${repos.join('%0D')}`)
}
