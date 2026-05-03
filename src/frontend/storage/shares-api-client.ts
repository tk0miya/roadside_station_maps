import type { CreateShareResponse, GetShareResponse, VisitRecord } from '@shared/api-types';
import { API_BASE_URL } from '../config';
import { SESSION_TOKEN_HEADER } from './visits-api-client';

export interface SharesApiClientOptions {
    getSessionToken: () => string | null;
    onSessionRefreshed?: (token: string) => void;
    onUnauthorized?: () => void;
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
    private readonly getSessionToken: () => string | null;
    private readonly onSessionRefreshed?: (token: string) => void;
    private readonly onUnauthorized?: () => void;

    constructor(options: SharesApiClientOptions) {
        this.getSessionToken = options.getSessionToken;
        this.onSessionRefreshed = options.onSessionRefreshed;
        this.onUnauthorized = options.onUnauthorized;
    }

    async create(): Promise<string> {
        const token = this.getSessionToken();
        if (!token) {
            throw new SharesApiError('Missing session token; user must be signed in');
        }

        const response = await fetch(`${API_BASE_URL}/api/shares`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });

        const refreshed = response.headers.get(SESSION_TOKEN_HEADER);
        if (refreshed) {
            this.onSessionRefreshed?.(refreshed);
        }

        if (response.status === 401) {
            this.onUnauthorized?.();
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
