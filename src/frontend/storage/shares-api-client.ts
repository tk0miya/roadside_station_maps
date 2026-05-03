import type { CreateShareResponse, GetShareResponse, VisitRecord } from '@shared/api-types';
import { type AuthTokenSource, MissingAccessTokenError, fetchWithAuth } from '../auth/fetch-with-auth';
import { API_BASE_URL } from '../config';

export interface SharesApiClientOptions {
    tokens: AuthTokenSource;
}

export class SharesApiError extends Error {
    constructor(
        message: string,
        public readonly status?: number
    ) {
        super(message);
        this.name = 'SharesApiError';
    }
}

export class SharesApiClient {
    private readonly tokens: AuthTokenSource;

    constructor(options: SharesApiClientOptions) {
        this.tokens = options.tokens;
    }

    async create(): Promise<string> {
        let response: Response;
        try {
            response = await fetchWithAuth(this.tokens, `${API_BASE_URL}/api/shares`, {
                method: 'POST',
            });
        } catch (error) {
            if (error instanceof MissingAccessTokenError) {
                throw new SharesApiError(error.message);
            }
            throw error;
        }

        if (!response.ok) {
            throw new SharesApiError(await readErrorMessage(response), response.status);
        }
        const body = (await response.json()) as CreateShareResponse;
        return body.shareId;
    }

    async get(shareId: string): Promise<VisitRecord[]> {
        const response = await fetch(`${API_BASE_URL}/shares/${encodeURIComponent(shareId)}`, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new SharesApiError(await readErrorMessage(response), response.status);
        }
        const body = (await response.json()) as GetShareResponse;
        return body.visits;
    }
}

async function readErrorMessage(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as { error?: string };
        if (body && typeof body.error === 'string') {
            return body.error;
        }
    } catch {
        // ignore JSON parse failures
    }
    return `Request failed with status ${response.status}`;
}
