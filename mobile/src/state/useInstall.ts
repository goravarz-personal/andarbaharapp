import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Works out how (and whether) this device can add the app to its home screen.
 *
 * Chrome on Android hands us an event we can turn into a one-tap install
 * button. Safari on iOS refuses to do that at all - Apple only allows it
 * through the Share menu - so there we explain the two taps instead. Anywhere
 * the app is already installed, or running as a real native build, there is
 * nothing to say.
 */
export type InstallState =
  | { kind: 'none' }
  | { kind: 'prompt'; install: () => Promise<void> }
  | { kind: 'ios' }
  | { kind: 'android' }
  | { kind: 'desktop' };

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so the touch check is what catches it.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function useInstallState(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    setInstalled(isStandalone());

    const onBeforeInstall = (event: Event) => {
      // Stops Chrome's own mini-banner so we can offer the button in context.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (Platform.OS !== 'web' || installed) return { kind: 'none' };

  if (deferred) {
    return {
      kind: 'prompt',
      install: async () => {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      },
    };
  }

  if (isIos()) return { kind: 'ios' };

  // Chrome only offers the install event once it decides the visitor is
  // engaged, so an Android phone often lands here first. Telling them where
  // the menu item is beats telling them nothing.
  if (isAndroid()) return { kind: 'android' };

  return { kind: 'desktop' };
}
