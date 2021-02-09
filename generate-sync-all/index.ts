import jsToYaml from "js-yaml";
import fs from "fs";
import path from "path";
import escapeStringRegexp from "escape-string-regexp";
import dirScan from "scan-dir-recursive/promise/relative";

interface ExpectedConfig {
    [groupName: string]: {
        secrets?: string[];
        label?: string;
        /**
         * @default `/sync/${group}/` e.g. if group is npm-packages the files to sync should be stored in /sync/npm-packages/
         */
        srcRoot?: string;
        repos: string[];
    };
}

const
    CONFIG_PATH = "repos.json",
    DIR_FOR_SYNCED_FILES = "sync",
    GITHUB_NATIVE_OWNER = "zardoy",
    GITHUB_TOKEN_FOR_SYNC = "${{ secrets.SYNC_GITHUB_TOKEN }}";

const addFilesSyncStep = async (filesSourceDir: string, targetRepos: string[]) => {
    const absoluteDir = path.join(__dirname, "..", filesSourceDir);
    // TODO special logic for workflows
    const relativePaths = await dirScan(absoluteDir);
    return {
        uses: "adrianjost/files-sync-action@master",
        with: {
            DRY_RUN: true,
            GITHUB_TOKEN: GITHUB_TOKEN_FOR_SYNC,
            SRC_ROOT: filesSourceDir,
            COMMIT_MESSAGE: "",
            FILE_PATTERNS: relativePaths
                .map(path => `^${escapeStringRegexp(path)}$`)
                .join("\n"),
            TARGET_REPOS: targetRepos.join("\n")
        }
    };
};

const addSecretsSyncStep = (secrets: string[], targetRepos: string[]) => {
    return {
        uses: "google/secrets-sync-action@master",
        with: {
            dry_run: true,
            secrets: secrets
                .map(secret => `^${escapeStringRegexp(secret)}$`)
                .join("\n"),
            repositories_list_regex: false,
            repositories: targetRepos.join("\n"),
            github_token: GITHUB_TOKEN_FOR_SYNC,
        },
        env: Object.fromEntries(
            secrets.map(secret => {
                return [secret, "${{ secrets."+ secret +" }}"]
            })
        ),
    }
}

interface GithubWorkflowJob {
    [jobName: string]: {
        "runs-on": "ubuntu-latest";
        steps: Array<{
            uses: string;
            with?: {
                [param: string]: string | boolean | number;
            }
        }>;
    }
}

const generateWorkflow = async () => {
    const REPOS_CONFIG_FILE_PATH = path.join(__dirname, "..", CONFIG_PATH);
    const reposConfig: ExpectedConfig = require(REPOS_CONFIG_FILE_PATH);
    const workflowJobs: GithubWorkflowJob = {};

    for (const [groupName, groupConfig] of Object.entries(reposConfig)) {
        if (typeof groupConfig !== "object" || !groupConfig.repos) {
            console.warn(`Skipping ${groupName} group as it doesn't have "repos" property`);
            continue;
        }
        const workflowSteps: GithubWorkflowJob[""]["steps"] = [];

        const targetRepos = groupConfig.repos.map(repo => {
            return ~repo.indexOf("/") ? repo : `${GITHUB_NATIVE_OWNER}/${repo}`;
        });
        if (groupConfig.secrets) {
            workflowSteps.push(
                addSecretsSyncStep(groupConfig.secrets, targetRepos)
            );
        }
        const filesSourceDir = groupConfig.srcRoot || `${DIR_FOR_SYNCED_FILES}/${groupName}`;
        if (
            fs.existsSync(path.join(__dirname, "..", filesSourceDir))
        ) {
            workflowSteps.push(
                await addFilesSyncStep(filesSourceDir, targetRepos)
            );
        } else {
            console.warn(`Skipping files sync in ${groupName} as directory ${filesSourceDir} doesn't exist`);
        }
        if (!workflowSteps.length) continue;
        workflowJobs["sync-" + groupName] = {
            "runs-on": "ubuntu-latest",
            steps: workflowSteps
        }
    }


    const WORKFLOW_NAME = "sync-all";
    const TOP_FILE_COMMENT = "# This file was generated by generate-sync-all script. Don't edit it directly.";

    const pathToWorkflow = `./.github/workflows/${WORKFLOW_NAME}.yml`;
    const yamlContent = jsToYaml.dump({
        name: "Sync Files & Secrets",
        on: {
            push: {
                branches: ["master", "main"]
            }
        },
        jobs: workflowJobs
    }, {
        lineWidth: -1,
        // noRefs: true
    });
    await fs.promises.writeFile(path.join(__dirname, "..", pathToWorkflow), TOP_FILE_COMMENT + "\n\n" + yamlContent);
}

generateWorkflow().catch(err => {
    throw err;
});
