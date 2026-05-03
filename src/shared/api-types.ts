export interface VisitRecord {
    stationId: string;
    styleId: number;
    updatedAt: number;
}

export interface ListVisitsResponse {
    visits: VisitRecord[];
}

export interface PutVisitRequest {
    styleId: number;
}

export interface BulkPutVisitsRequest {
    visits: Array<{
        stationId: string;
        styleId: number;
    }>;
}

export interface ApiErrorResponse {
    error: string;
}

export interface CreateShareResponse {
    shareId: string;
}

export interface GetShareResponse {
    visits: VisitRecord[];
}

export interface CreateSessionRequest {
    provider: 'google';
    idToken: string;
}

export interface CreateSessionResponse {
    sessionToken: string;
    expiresAt: number;
}

export interface RefreshSessionResponse {
    sessionToken: string;
    expiresAt: number;
}
