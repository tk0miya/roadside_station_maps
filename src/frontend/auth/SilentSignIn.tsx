import { useGoogleOneTapLogin } from '@react-oauth/google';
import { useAuthManager } from './auth-context';

// Attempts a silent re-authentication via Google One Tap with auto_select.
// Only enabled when the user previously had a session (token in storage at
// startup, or a successful login earlier in this session) so that first-time
// visitors are not prompted unexpectedly.
export function SilentSignIn() {
    const manager = useAuthManager();
    const shouldAttempt = !manager.getState().user && manager.hadPreviousSession;

    useGoogleOneTapLogin({
        onSuccess: (response) => {
            if (response.credential) {
                manager.handleCredential(response.credential);
            }
        },
        auto_select: true,
        disabled: !shouldAttempt,
    });

    return null;
}
