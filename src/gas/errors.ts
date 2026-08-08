// Failure vocabulary of the plan API.
//
// An Apps Script web app can only ever answer HTTP 200, so the outcome of a
// request is carried in the response body instead: `{ ok: false, error: { code,
// message } }`. These codes are what a client switches on.

export type ErrorCode = 'bad_request' | 'unauthorized' | 'not_found' | 'conflict' | 'internal';

export class ApiError extends Error {
    readonly code: ErrorCode;

    constructor(code: ErrorCode, message: string) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
    }
}
