import { describe, expect, it } from 'vitest';
import { expectApiError } from '#test-utils/gas';
import { tokensMatch, verifyToken } from './token';

describe('verifyToken', () => {
    it('accepts the configured token', () => {
        expect(() => verifyToken('s3cr3t', 's3cr3t')).not.toThrow();
    });

    it('rejects a wrong token as unauthorized', () => {
        expectApiError(() => verifyToken('nope', 's3cr3t'), 'unauthorized');
    });

    it('rejects a missing or non-string token as unauthorized', () => {
        expectApiError(() => verifyToken(undefined, 's3cr3t'), 'unauthorized');
        expectApiError(() => verifyToken(42, 's3cr3t'), 'unauthorized');
    });

    it('refuses every request while API_TOKEN is unset, as if the token were wrong', () => {
        expectApiError(() => verifyToken('anything', null), 'unauthorized');
        expectApiError(() => verifyToken('anything', ''), 'unauthorized');
    });
});

describe('tokensMatch', () => {
    it('accepts the expected token', () => {
        expect(tokensMatch('s3cr3t', 's3cr3t')).toBe(true);
    });

    it('rejects a different token of the same length', () => {
        expect(tokensMatch('s3cr3T', 's3cr3t')).toBe(false);
    });

    it('rejects a prefix of the expected token', () => {
        expect(tokensMatch('s3cr', 's3cr3t')).toBe(false);
    });

    it('rejects a longer token sharing the prefix', () => {
        expect(tokensMatch('s3cr3t!', 's3cr3t')).toBe(false);
    });

    it('rejects an empty token', () => {
        expect(tokensMatch('', 's3cr3t')).toBe(false);
    });
});
