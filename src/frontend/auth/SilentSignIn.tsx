import { useGoogleOneTapLogin } from '@react-oauth/google';
import { useAuthManager } from './auth-context';

// Attempts a silent re-authentication via Google One Tap with auto_select.
// Only enabled when the user previously had a session (token in storage at
// startup, or a successful login earlier in this session) so that first-time
// visitors are not prompted unexpectedly.
//
// While this attempt is in flight, LoginButton must not render <GoogleLogin>
// because GoogleLogin internally calls google.accounts.id.initialize() without
// auto_select, which would overwrite our auto_select=true configuration before
// the One Tap prompt resolves. We notify AuthManager once the attempt has
// settled (success or any prompt-moment notification) so LoginButton can then
// safely render.
export function SilentSignIn() {
    const manager = useAuthManager();
    const shouldAttempt = !manager.getState().user && manager.hadPreviousSession;

    useGoogleOneTapLogin({
        onSuccess: (response) => {
            if (response.credential) {
                manager.handleCredential(response.credential);
            }
            manager.markSilentSignInSettled();
        },
        onError: () => {
            manager.markSilentSignInSettled();
        },
        promptMomentNotification: (notification) => {
            if (
                notification.isNotDisplayed() ||
                notification.isSkippedMoment() ||
                notification.isDismissedMoment()
            ) {
                manager.markSilentSignInSettled();
            }
        },
        auto_select: true,
        disabled: !shouldAttempt,
    });

    return null;
}
