import type { D1Database } from '@cloudflare/workers-types';
import type { AuthUser } from '@shared/auth-types';

export interface Bindings {
    DB: D1Database;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    SESSION_JWT_SECRET: string;
    ALLOWED_ORIGINS: string;
}

export interface Variables {
    user: AuthUser;
}

export interface AppEnv {
    Bindings: Bindings;
    Variables: Variables;
}
