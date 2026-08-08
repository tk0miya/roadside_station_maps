import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readDeploymentId } from './deploy-gas';

const created: string[] = [];

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'gas-deploy-'));
    created.push(dir);
    return dir;
}

function idFileContaining(contents: string): string {
    const path = join(tempDir(), '.deployment-id');
    writeFileSync(path, contents);
    return path;
}

function missingIdFile(): string {
    return join(tempDir(), '.deployment-id');
}

// The variable is a documented way to configure a real deployment, so a
// developer running the suite may well have it set; every case states what it
// expects rather than inheriting the ambient value.
beforeEach(() => {
    vi.stubEnv('GAS_DEPLOYMENT_ID', undefined);
});

afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of created.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe('readDeploymentId', () => {
    it('reads the pinned id from the file', () => {
        expect(readDeploymentId(idFileContaining('AKfycbxPINNED'))).toBe('AKfycbxPINNED');
    });

    // `echo id > file` leaves a trailing newline, so the file is trimmed.
    it('ignores whitespace around the id', () => {
        expect(readDeploymentId(idFileContaining('  AKfycbxPINNED\n'))).toBe('AKfycbxPINNED');
    });

    it('prefers the environment variable, so CI can override the file', () => {
        vi.stubEnv('GAS_DEPLOYMENT_ID', 'AKfycbxFROM_ENV');
        expect(readDeploymentId(idFileContaining('AKfycbxPINNED'))).toBe('AKfycbxFROM_ENV');
    });

    it('falls through an empty environment variable to the file', () => {
        vi.stubEnv('GAS_DEPLOYMENT_ID', '   ');
        expect(readDeploymentId(idFileContaining('AKfycbxPINNED'))).toBe('AKfycbxPINNED');
    });

    // Deploying to a guessed or empty id would either fail obscurely or hit the
    // wrong deployment, so an unconfigured release stops with the setup steps.
    it('explains the setup when nothing is configured', () => {
        expect(() => readDeploymentId(missingIdFile())).toThrow(/No deployment id configured/);
    });

    it('treats an empty file as unconfigured', () => {
        expect(() => readDeploymentId(idFileContaining('\n'))).toThrow(/No deployment id configured/);
    });
});
