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

export interface ApiErrorResponse {
    error: string;
}
