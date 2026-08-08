// Shared-secret check for the web app.
//
// An Apps Script web app cannot read request headers, so the token travels in
// the JSON request body rather than an Authorization header.

import { ApiError } from './errors';

// Compares every character of the expected token regardless of where the guess
// first diverges — short guesses wrap around rather than ending the loop early
// — so how much of the secret a guess got right does not show up in the
// response time.
export function tokensMatch(provided: string, expected: string): boolean {
    let diff = provided.length ^ expected.length;
    for (let i = 0; i < expected.length; i += 1) {
        diff |= provided.charCodeAt(i % (provided.length || 1)) ^ expected.charCodeAt(i);
    }
    return diff === 0;
}

// `expected` is the API_TOKEN script property. A deployment that has not set it
// serves nothing rather than serving an open API — and answers a misconfigured
// deployment exactly as it answers a bad guess, since the caller is anonymous.
// The reason is logged instead.
export function verifyToken(provided: unknown, expected: string | null): void {
    if (!expected) {
        console.error('The API_TOKEN script property is not set; refusing every request');
    }
    if (!expected || typeof provided !== 'string' || !tokensMatch(provided, expected)) {
        throw new ApiError('unauthorized', 'Missing or invalid API token');
    }
}
