import { appConfig } from '@/config/appConfig';

/**
 * Google reCAPTCHA v3 & Enterprise Frontend Helper
 * Supports dynamic runtime configuration, safe DOM script replacement on key rotation,
 * and graceful bypass when reCAPTCHA is disabled by administrator.
 */

interface GRecaptchaObject {
  execute?: (siteKey: string, options: { action: string }) => Promise<string>;
  ready?: (callback: () => void) => void;
  enterprise?: GRecaptchaObject;
}

interface WindowWithRecaptcha extends Window {
  grecaptcha?: GRecaptchaObject;
}

// Runtime dynamic settings populated from SiteContext
let runtimeSiteKey: string | null = null;
let runtimeEnabled: boolean | null = null;
let activeLoadedSiteKey: string | null = null;
let recaptchaScriptPromise: Promise<void> | null = null;

/**
 * Updates dynamic runtime reCAPTCHA settings from SiteContext.
 * If the Site Key changes or reCAPTCHA is disabled, cleans up previous DOM elements
 * and resets stale promises to avoid stale key assessment or badge duplicates.
 */
export const setRecaptchaRuntimeConfig = (config: { siteKey?: string; enabled?: string | boolean }) => {
  if (typeof window === 'undefined') return;

  const newEnabled = config.enabled !== undefined
    ? (config.enabled === true || config.enabled === 'true')
    : null;
  const newSiteKey = (config.siteKey && config.siteKey.trim()) ? config.siteKey.trim() : null;

  const siteKeyChanged = newSiteKey !== null && activeLoadedSiteKey !== null && newSiteKey !== activeLoadedSiteKey;
  const wasDisabled = runtimeEnabled !== false && newEnabled === false;

  runtimeSiteKey = newSiteKey;
  runtimeEnabled = newEnabled;

  if (siteKeyChanged || wasDisabled) {
    // 1. Remove previous script tag
    const existingScript = document.getElementById('google-recaptcha');
    if (existingScript && existingScript.parentNode) {
      existingScript.parentNode.removeChild(existingScript);
    }

    // 2. Remove any floating grecaptcha badges
    const badges = document.querySelectorAll('.grecaptcha-badge');
    badges.forEach(badge => {
      if (badge.parentNode) badge.parentNode.removeChild(badge);
    });

    // 3. Clear window.grecaptcha and reset cached promise
    const win = window as any;
    if (win.grecaptcha) {
      try {
        delete win.grecaptcha;
      } catch (_) {
        win.grecaptcha = undefined;
      }
    }
    recaptchaScriptPromise = null;
    activeLoadedSiteKey = null;
  }
};

/**
 * Dynamically injects the Google reCAPTCHA script into document head.
 * Resolves when the script is fully loaded and grecaptcha is ready.
 * Includes timeout protection and error reset to prevent hanging promises.
 */
export const loadRecaptchaScript = (siteKey: string): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();

  const win = window as WindowWithRecaptcha;

  // If already loaded for this exact site key
  if (activeLoadedSiteKey === siteKey && (win.grecaptcha?.execute || win.grecaptcha?.enterprise?.execute)) {
    return Promise.resolve();
  }

  // If site key changed while script was previously loaded, clean up first
  if (activeLoadedSiteKey && activeLoadedSiteKey !== siteKey) {
    const existingScript = document.getElementById('google-recaptcha');
    if (existingScript && existingScript.parentNode) {
      existingScript.parentNode.removeChild(existingScript);
    }
    const badges = document.querySelectorAll('.grecaptcha-badge');
    badges.forEach(badge => {
      if (badge.parentNode) badge.parentNode.removeChild(badge);
    });
    recaptchaScriptPromise = null;
  }

  if (!recaptchaScriptPromise) {
    recaptchaScriptPromise = new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const handleSuccess = () => {
        cleanup();
        activeLoadedSiteKey = siteKey;
        resolve();
      };

      const handleFailure = (errMsg: string) => {
        cleanup();
        recaptchaScriptPromise = null;
        activeLoadedSiteKey = null;
        reject(new Error(errMsg));
      };

      // Set timeout in case the script stalls (e.g. blocked by firewall/adblocker)
      timeoutId = setTimeout(() => {
        handleFailure('Security verification script (reCAPTCHA) timed out. Please check your network connection or disable ad-blockers and reload.');
      }, 10000);

      const existingScript = document.getElementById('google-recaptcha') as HTMLScriptElement | null;
      if (existingScript) {
        if (win.grecaptcha?.execute || win.grecaptcha?.enterprise?.execute) {
          handleSuccess();
          return;
        }
        existingScript.addEventListener('load', handleSuccess, { once: true });
        existingScript.addEventListener('error', () => handleFailure('Failed to load Google reCAPTCHA script. Please check your internet connection or ad-blocker.'), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-recaptcha';
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.defer = true;
      script.onload = handleSuccess;
      script.onerror = () => handleFailure('Failed to load Google reCAPTCHA script. If you use an ad-blocker or script-blocker, please disable it for this site and refresh.');
      document.head.appendChild(script);
    });
  }

  return recaptchaScriptPromise;
};

/**
 * Executes Google reCAPTCHA for a specific user action and returns the assessment token.
 * Throws actionable errors on failure in production so forms do not submit invalid requests.
 *
 * @param action Expected action string ('login', 'signup', 'forgot_password', 'book_repair', 'contact_us', 'google_login')
 * @returns Token string, or null if reCAPTCHA is explicitly disabled
 */
export const getRecaptchaToken = async (action: string): Promise<string | null> => {
  // 1. Explicitly disabled via Admin settings
  if (runtimeEnabled === false) {
    return null;
  }

  // 2. Resolve dynamic site key with fallback to static appConfig
  const siteKey = (runtimeSiteKey && runtimeSiteKey.trim()) ? runtimeSiteKey.trim() : appConfig.recaptchaSiteKey;

  // 3. If no site key is configured
  if (!siteKey || siteKey.trim() === '') {
    if (appConfig.isDevelopment) {
      return 'test-token';
    }
    throw new Error('reCAPTCHA site key is not configured. Please configure it in Admin -> Website Settings.');
  }

  try {
    await loadRecaptchaScript(siteKey);

    const win = window as WindowWithRecaptcha;
    const grecaptcha = win.grecaptcha;

    if (!grecaptcha) {
      if (appConfig.isDevelopment) {
        return 'test-token';
      }
      throw new Error('reCAPTCHA runtime is not available. Please disable any ad-blockers or content filters and refresh the page.');
    }

    return await new Promise<string>((resolve, reject) => {
      const execTimer = setTimeout(() => {
        reject(new Error('Security verification (reCAPTCHA) execution timed out. Please try again.'));
      }, 15000);

      // reCAPTCHA v3 only attaches `execute` once the async runtime script finishes loading
      const runExecute = async () => {
        try {
          const activeExecutor = grecaptcha.enterprise?.execute ? grecaptcha.enterprise : grecaptcha;

          if (!activeExecutor || typeof activeExecutor.execute !== 'function') {
            clearTimeout(execTimer);
            if (appConfig.isDevelopment) {
              resolve('test-token');
              return;
            }
            reject(new Error('reCAPTCHA runtime is not available. Please disable any ad-blockers or content filters and refresh the page.'));
            return;
          }

          const token = await activeExecutor.execute(siteKey, { action });
          clearTimeout(execTimer);
          if (!token || typeof token !== 'string' || !token.trim()) {
            reject(new Error('Security verification returned an empty token. Please refresh the page and try again.'));
            return;
          }
          resolve(token.trim());
        } catch (execErr: unknown) {
          clearTimeout(execTimer);
          if (appConfig.isDevelopment) {
            resolve('test-token');
            return;
          }
          const msg = execErr instanceof Error ? execErr.message : 'Execution failed';
          reject(new Error(`Security check failed: ${msg}. If using an ad-blocker or Brave Shields, please disable it for this domain and refresh.`));
        }
      };

      if (typeof grecaptcha.ready === 'function') {
        grecaptcha.ready(() => { void runExecute(); });
      } else {
        void runExecute();
      }
    });
  } catch (err: unknown) {
    if (appConfig.isDevelopment) {
      return 'test-token';
    }
    throw err instanceof Error ? err : new Error('Security verification failed. Please refresh the page and try again.');
  }
};
