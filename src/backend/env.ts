import type { D1Database } from '@cloudflare/workers-types';
import type { AuthUser } from '../shared/auth-types';

export interface Bindings {
    DB: D1Database;
    GOOGLE_CLIENT_ID: string;
    ALLOWED_ORIGINS: string;
}

export interface Variables {
    user: AuthUser;
}

export interface AppEnv {
    Bindings: Bindings;
    Variables: Variables;
}
