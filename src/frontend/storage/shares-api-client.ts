import type { CreateShareResponse, GetShareResponse, VisitRecord } from '@shared/api-types';

export interface SharesApiClientOptions {
    baseUrl: string;
    getIdToken: () => string | null;
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
    private readonly baseUrl: string;
    private readonly getIdToken: () => string | null;

    constructor(options: SharesApiClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/$/, '');
        this.getIdToken = options.getIdToken;
    }

    async create(): Promise<string> {
        const token = this.getIdToken();
        if (!token) {
            throw new SharesApiError('Missing ID token; user must be signed in');
        }

        const response = await fetch(`${this.baseUrl}/api/shares`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            throw new SharesApiError(await readErrorMessage(response), response.status);
        }
        const body = (await response.json()) as CreateShareResponse;
        return body.shareId;
    }

    async get(shareId: string): Promise<VisitRecord[]> {
        const response = await fetch(`${this.baseUrl}/shares/${encodeURIComponent(shareId)}`, {
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
