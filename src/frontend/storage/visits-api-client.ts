import type { ListVisitsResponse, PutVisitRequest, VisitRecord } from '@shared/api-types';

export interface VisitsApiClientOptions {
    baseUrl: string;
    getIdToken: () => string | null;
}

export class VisitsApiError extends Error {
    constructor(
        message: string,
        public readonly status?: number
    ) {
        super(message);
        this.name = 'VisitsApiError';
    }
}

export class VisitsApiClient {
    private readonly baseUrl: string;
    private readonly getIdToken: () => string | null;

    constructor(options: VisitsApiClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/$/, '');
        this.getIdToken = options.getIdToken;
    }

    async list(): Promise<VisitRecord[]> {
        const response = await this.request('/api/visits', { method: 'GET' });
        const body = (await response.json()) as ListVisitsResponse;
        return body.visits;
    }

    async put(stationId: string, styleId: number): Promise<void> {
        const body: PutVisitRequest = { styleId };
        await this.request(`/api/visits/${encodeURIComponent(stationId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    async delete(stationId: string): Promise<void> {
        await this.request(`/api/visits/${encodeURIComponent(stationId)}`, { method: 'DELETE' });
    }

    private async request(path: string, init: RequestInit): Promise<Response> {
        const token = this.getIdToken();
        if (!token) {
            throw new VisitsApiError('Missing ID token; user must be signed in');
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers: {
                ...(init.headers ?? {}),
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const message = await safeReadError(response);
            throw new VisitsApiError(message, response.status);
        }
        return response;
    }
}

async function safeReadError(response: Response): Promise<string> {
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
