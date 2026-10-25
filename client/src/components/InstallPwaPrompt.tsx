import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, PlusSquare, Smartphone, Check } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    // 1. Check if already running in standalone PWA mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 2. Check if user recently dismissed the prompt (hide for 24 hours)
    const dismissedAt = localStorage.getItem('tekdoctor_pwa_dismissed');
    if (dismissedAt) {
      const hoursSinceDismiss = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60);
      if (hoursSinceDismiss < 24) {
        return;
      }
    }

    // 3. Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);

    if (isIosDevice && isSafari) {
      setIsIos(true);
      // Delay prompt slightly so page settles
      const timer = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(timer);
    }

    // 4. Capture standard Chromium/Android beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Wait 2.5 seconds after page load before showing prompt
      setTimeout(() => {
        setIsVisible(true);
      }, 2500);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsVisible(false);
      setDeferredPrompt(null);
      localStorage.removeItem('tekdoctor_pwa_dismissed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    setIsInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === 'accepted') {
        setInstalledSuccess(true);
        setTimeout(() => {
          setIsVisible(false);
          setIsInstalled(true);
        }, 1500);
      } else {
        handleDismiss();
      }
    } catch (err) {
      console.warn('[PWA] Prompt error:', err);
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('tekdoctor_pwa_dismissed', Date.now().toString());
  };

  // Do not render if installed or not ready
  if (isInstalled || !isVisible) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: 'spring', damping: 20, stiffness: 260 }}
        className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-50 pointer-events-auto"
        role="region"
        aria-label="Install TekDoctor App"
      >
        <div className="bg-[#09090d]/95 backdrop-blur-xl border border-neon-cyan/40 rounded-2xl p-4 shadow-[0_10px_35px_rgba(0,0,0,0.8),0_0_20px_rgba(0,229,255,0.2)] relative overflow-hidden">
          {/* Subtle top neon ambient glow */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-neon-cyan to-transparent" />

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1.5 text-zinc-500 hover:text-white rounded-lg transition-colors cursor-pointer"
            aria-label="Dismiss install banner"
          >
            <X size={16} />
          </button>

          <div className="flex items-start gap-3.5 pr-6">
            {/* App Icon */}
            <div className="w-12 h-12 rounded-xl bg-black border border-neon-cyan/50 p-1 shrink-0 shadow-[0_0_12px_rgba(0,229,255,0.3)] flex items-center justify-center overflow-hidden">
              <img
                src="/favicon.png"
                alt="TekDoctor App Icon"
                className="w-full h-full object-contain p-1 rounded-lg"
              />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-white font-outfit tracking-tight">TekDoctor</h2>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neon-cyan/15 text-neon-cyan uppercase font-semibold">App</span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                {isIos
                  ? 'Add to your Home Screen for faster 1-tap access!'
                  : 'Install on your phone for instant, smooth 1-tap access without opening browser tabs.'}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3.5 pt-3 border-t border-zinc-800/80">
            {isIos ? (
              <div className="flex items-center gap-2 text-[11px] text-zinc-300 bg-zinc-900/60 border border-zinc-800 p-2.5 rounded-xl font-mono">
                <span>1. Tap Share</span>
                <Share size={13} className="text-neon-cyan shrink-0" />
                <span>2. Select &ldquo;Add to Home Screen&rdquo;</span>
                <PlusSquare size={13} className="text-neon-cyan shrink-0" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleInstallClick}
                  disabled={isInstalling || installedSuccess}
                  className="flex-1 py-2.5 px-3 bg-neon-cyan hover:bg-neon-cyan/90 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_15px_rgba(0,229,255,0.4)] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-75"
                >
                  {installedSuccess ? (
                    <>
                      <Check size={14} />
                      <span>Installed!</span>
                    </>
                  ) : isInstalling ? (
                    <span>Opening Install...</span>
                  ) : (
                    <>
                      <Download size={14} />
                      <span>Add to Home Screen</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleDismiss}
                  className="py-2.5 px-3 text-zinc-400 hover:text-zinc-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Later
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
