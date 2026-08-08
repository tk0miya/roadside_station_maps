// Releases the Apps Script project to one pinned deployment, so that the web
// app URL stays the same across releases. The id is that URL, so it is read
// from a gitignored file or the environment, never from the repository.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ID_FILE = 'gas/.deployment-id';
const ID_ENV = 'GAS_DEPLOYMENT_ID';

const SETUP_HELP = `No deployment id configured.

Create the deployment once, then pin the id it prints:

  npx -y @google/clasp@3 -P gas create-deployment
  echo "<deploymentId>" > ${ID_FILE}

The ${ID_ENV} environment variable takes precedence over the file.`;

export function readDeploymentId(idFile: string = ID_FILE): string {
    const fromEnv = process.env[ID_ENV]?.trim();
    if (fromEnv) {
        return fromEnv;
    }
    if (existsSync(idFile)) {
        const fromFile = readFileSync(idFile, 'utf8').trim();
        if (fromFile) {
            return fromFile;
        }
    }
    throw new Error(SETUP_HELP);
}

function redeploy(deploymentId: string, description: string): void {
    const args = ['-y', '@google/clasp@3', '-P', 'gas', 'redeploy', deploymentId, '-d', description];
    const result = spawnSync('npx', args, { stdio: 'inherit' });

    if (result.error) {
        throw result.error;
    }
    if (result.signal) {
        throw new Error(`clasp redeploy was killed by ${result.signal}`);
    }
    if (result.status !== 0) {
        throw new Error(`clasp redeploy exited with ${result.status}`);
    }
}

// CLI handling. Anything after `--` becomes the deployment description shown in
// the Apps Script UI, e.g. `npm run gas:deploy -- "add memo column"`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        redeploy(readDeploymentId(), process.argv.slice(2).join(' ') || 'release');
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
