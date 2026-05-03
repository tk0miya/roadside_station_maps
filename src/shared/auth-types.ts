export interface AuthUser {
    // Google's stable user id; used as the user key for online storage.
    sub: string;
}

export interface AuthState {
    user: AuthUser | null;
    accessToken: string | null;
}

export interface AuthLoginRequest {
    code: string;
}

export interface AuthLoginResponse {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
}

export interface AuthRefreshRequest {
    refreshToken: string;
}

export interface AuthRefreshResponse {
    accessToken: string;
}
