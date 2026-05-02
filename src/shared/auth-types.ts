export interface AuthUser {
    // Google's stable user id; used as the user key for online storage.
    sub: string;
}

export interface AuthState {
    user: AuthUser | null;
    idToken: string | null;
}
