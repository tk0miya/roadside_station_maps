import type { ListVisitsResponse, PutVisitRequest, VisitRecord } from '@shared/api-types';
import { type AuthTokenSource, MissingAccessTokenError, fetchWithAuth } from '../auth/fetch-with-auth';
import { API_BASE_URL } from '../config';

export interface VisitsApiClientOptions {
    tokens: AuthTokenSource;
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
    private readonly tokens: AuthTokenSource;

    constructor(options: VisitsApiClientOptions) {
        this.tokens = options.tokens;
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
        let response: Response;
        try {
            response = await fetchWithAuth(this.tokens, `${API_BASE_URL}${path}`, init);
        } catch (error) {
            if (error instanceof MissingAccessTokenError) {
                throw new VisitsApiError(error.message);
            }
            throw error;
        }

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
