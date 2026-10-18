import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/context/AuthContext';
import { useSiteContext } from '@/context/SiteContext';
import { authApi } from '@/services/api';
import { appConfig } from '@/config/appConfig';
import { getRecaptchaToken } from '@/utils/recaptcha';

interface GoogleSignInButtonProps {
  text?: string;
  onError?: (errorMessage: string) => void;
  onSuccess?: () => void;
  disabled?: boolean;
  className?: string;
  redirectPath?: string;
  onOtpRequired?: (data: { pendingToken: string; maskedEmail: string }) => void;
}

// Global script load promise cache
let gsiScriptPromise: Promise<void> | null = null;

const loadGoogleGsiScript = (): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();

  // Already loaded
  if ((window as any).google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.getElementById('google-gsi-client') as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve());
        existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services script.')));
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-gsi-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gsiScriptPromise = null;
        reject(new Error('Failed to load Google Identity Services script. Please check your internet connection.'));
      };
      document.head.appendChild(script);
    });
  }

  return gsiScriptPromise;
};

export default function GoogleSignInButton({
  text = 'Continue with Google',
  onError,
  onSuccess,
  disabled = false,
  className = '',
  redirectPath,
  onOtpRequired,
}: GoogleSignInButtonProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { login } = useAuth();
  const { flattenedSettings } = useSiteContext();

  // Hide button completely when Google Login is disabled by administrator
  const isGoogleDisabled = flattenedSettings.google_login_enabled === 'false';
  if (isGoogleDisabled) {
    return null;
  }

  const handleGoogleClick = async () => {
    if (disabled || isAuthenticating) return;

    // Dynamically resolve client ID from site settings with fallback to environment config
    const clientId = (flattenedSettings.google_client_id && flattenedSettings.google_client_id.trim())
      ? flattenedSettings.google_client_id.trim()
      : appConfig.googleClientId;

    if (!clientId || clientId.trim() === '') {
      const msg = 'Google Sign-In is not configured yet. Please configure Google Client ID in Admin -> Website Settings.';
      onError?.(msg);
      toast.error('Google Sign-In is not configured.');
      return;
    }

    setIsAuthenticating(true);

    try {
      await loadGoogleGsiScript();

      const google = (window as any).google;
      if (!google?.accounts?.oauth2) {
        throw new Error('Google Identity Services client is not available.');
      }

      const client = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: 'openid email profile',
        ux_mode: 'popup',
        callback: async (response: any) => {
          if (response.error) {
            setIsAuthenticating(false);
            if (response.error === 'popup_closed_by_user') {
              return; // User intentionally closed popup
            }
            const errorMsg = response.error_description || response.error || 'Google authentication was cancelled or failed.';
            onError?.(errorMsg);
            toast.error(errorMsg);
            return;
          }

          if (response.code) {
            try {
              const recaptchaToken = await getRecaptchaToken('google_login');
              const result = await authApi.googleSignIn({ code: response.code, recaptchaToken });

              if (!result.ok || !result.data?.data) {
                throw new Error(result.error || 'Server rejected Google authentication.');
              }

              // Intercept Admin OTP challenge
              if (result.data.data.requiresOtp) {
                if (onOtpRequired && result.data.data.pendingToken) {
                  onOtpRequired({
                    pendingToken: result.data.data.pendingToken,
                    maskedEmail: result.data.data.maskedEmail || ''
                  });
                  return;
                } else {
                  toast.error('Admin authentication requires email OTP verification.');
                  return;
                }
              }

              const { id, name, email, role, token, avatar_url } = result.data.data;
              if (!token || !id || !name || !email || !role) {
                throw new Error('Authentication token or user information missing from response.');
              }

              toast.success(`Welcome back, ${name}!`);
              if (role === 'customer' && redirectPath) {
                login(token, { id, name, email, role: role as UserRole, avatar_url }, false, redirectPath);
              } else {
                login(token, { id, name, email, role: role as UserRole, avatar_url });
              }
              onSuccess?.();
            } catch (backendError: any) {
              const msg = backendError?.message || 'Authentication failed on the server.';
              onError?.(msg);
              toast.error(msg);
            } finally {
              setIsAuthenticating(false);
            }
          } else {
            setIsAuthenticating(false);
          }
        },
        error_callback: (err: any) => {
          setIsAuthenticating(false);
          if (err?.type === 'popup_closed') {
            return;
          }
          if (err?.type === 'popup_blocked') {
            const blockedMsg = 'Sign-in popup was blocked by your browser. Please allow popups for TekDoctor.';
            onError?.(blockedMsg);
            toast.error(blockedMsg);
            return;
          }
          const generalMsg = 'Google popup could not be opened. Please try again.';
          onError?.(generalMsg);
          toast.error(generalMsg);
        }
      });

      client.requestCode();
    } catch (loadError: any) {
      setIsAuthenticating(false);
      const msg = loadError?.message || 'Failed to initialize Google Sign-In.';
      onError?.(msg);
      toast.error(msg);
    }
  };

  return (
    <button
      type="button"
      id="google-signin-btn"
      onClick={handleGoogleClick}
      disabled={disabled || isAuthenticating}
      aria-label={text}
      className={`w-full bg-zinc-900/80 hover:bg-zinc-800 text-white border border-zinc-700/50 hover:border-zinc-500 py-3.5 sm:py-4 px-4 rounded-xl font-bold tracking-wide text-sm transition-all flex items-center justify-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-neon-cyan/30 ${className}`}
    >
      {isAuthenticating ? (
        <>
          <Loader2 className="animate-spin text-neon-cyan" size={18} />
          <span className="font-mono uppercase tracking-wider text-xs sm:text-sm font-semibold text-zinc-300">
            Connecting to Google...
          </span>
        </>
      ) : (
        <>
          {/* Official Google Multi-Color SVG Icon */}
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span className="font-mono uppercase tracking-wider text-xs sm:text-sm font-semibold">
            {text}
          </span>
        </>
      )}
    </button>
  );
}
