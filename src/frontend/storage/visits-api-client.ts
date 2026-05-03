import type { ListVisitsResponse, PutVisitRequest, VisitRecord } from '@shared/api-types';
import { API_BASE_URL } from '../config';

export const SESSION_TOKEN_HEADER = 'X-Session-Token';

export interface VisitsApiClientOptions {
    getSessionToken: () => string | null;
    onSessionRefreshed?: (token: string) => void;
    onUnauthorized?: () => void;
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
    private readonly getSessionToken: () => string | null;
    private readonly onSessionRefreshed?: (token: string) => void;
    private readonly onUnauthorized?: () => void;

    constructor(options: VisitsApiClientOptions) {
        this.getSessionToken = options.getSessionToken;
        this.onSessionRefreshed = options.onSessionRefreshed;
        this.onUnauthorized = options.onUnauthorized;
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
        const token = this.getSessionToken();
        if (!token) {
            throw new VisitsApiError('Missing session token; user must be signed in');
        }

        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...init,
            headers: {
                ...(init.headers ?? {}),
                Authorization: `Bearer ${token}`,
            },
        });

        const refreshed = response.headers.get(SESSION_TOKEN_HEADER);
        if (refreshed) {
            this.onSessionRefreshed?.(refreshed);
        }

        if (response.status === 401) {
            this.onUnauthorized?.();
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
